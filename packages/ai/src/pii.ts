// 個人情報の検出（FR-PII-01, architecture 3.4）。
// DOM のテキストがあれば正規表現で手元で見つけ、画像は LLM に見てもらう。結果は「候補」で、加工は利用者が確認してから行う
import { type PiiKind, PiiKindSchema, type PiiMethod, type Rect } from "@harie/model";
import { z } from "zod";
import type { DomSnapshot } from "./dom";
import { dummyFor } from "./dummy";
import { iou, pad, toCanvasRect } from "./geometry";
import { PII_KIND_RULE, PII_SCOPE_RULES } from "./guide";
import type { ImageInput, LlmClient } from "./llm";

export const PiiOutputSchema = z.object({
  findings: z.array(
    z.object({
      kind: PiiKindSchema,
      /** 個人情報が写っている範囲（送った画像のピクセル座標） */
      box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
      /** 読み取った文字列（顔なら空）。ダミー値の形を決めるためだけに使い、保存しない */
      text: z.string(),
    }),
  ),
});
export type PiiOutput = z.infer<typeof PiiOutputSchema>;

/** 検出候補。`text` はメモリ上でだけ使い、ファイルにも記録にも残さない（ADR-0007） */
export type PiiCandidate = {
  kind: PiiKind;
  rect: Rect;
  text: string;
  method: PiiMethod;
  replacement: string;
  source: "dom" | "image";
};

const SYSTEM = `あなたは、公開するスクリーンショットから個人情報を見つける担当者です。
画像の中の個人情報らしきものをすべて挙げてください。見落としは、余分な候補よりも重い問題です。

${[
  PII_KIND_RULE,
  "box: その文字列・顔をちょうど囲む矩形。座標は渡した画像のピクセル（左上が原点）で答える。同じ人の情報でも、離れた場所にあれば別々に挙げる。",
  "text: 読み取った文字列そのもの。顔は空文字。",
  ...PII_SCOPE_RULES,
]
  .map((rule) => `- ${rule}`)
  .join("\n")}`;

const PATTERNS: { kind: PiiKind; re: RegExp }[] = [
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  // 国内の電話番号（0 から始まる 10〜11 桁、ハイフン区切りを含む）と +81
  { kind: "phone", re: /(?:\+81[-\s]?|0)\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/ },
  { kind: "address", re: /〒?\d{3}-\d{4}/ },
];

/** 加工方法の既定。文字はダミー置換（FR-PII-02）、顔はモザイクでは不十分なことがあるので塗りつぶし */
export function defaultMethod(kind: PiiKind): PiiMethod {
  return kind === "face" ? "fill" : "replace";
}

function candidate(
  kind: PiiKind,
  rect: Rect,
  text: string,
  source: PiiCandidate["source"],
  index: number,
): PiiCandidate {
  return {
    kind,
    rect,
    text,
    method: defaultMethod(kind),
    replacement: dummyFor(kind, text, index),
    source,
  };
}

/** DOM のテキストから、正規表現と入力欄の手がかり（piiHint）で候補を作る（LLM を使わない） */
export function detectPiiInDom(dom: DomSnapshot): Omit<PiiCandidate, "replacement" | "method">[] {
  const found: Omit<PiiCandidate, "replacement" | "method">[] = [];
  for (const e of dom.elements) {
    const text = e.text ?? "";
    if (e.piiHint !== undefined && e.piiHint !== null) {
      found.push({ kind: e.piiHint, rect: e.rect, text, source: "dom" });
      continue;
    }
    const hit = PATTERNS.find((p) => p.re.test(text));
    if (hit !== undefined) found.push({ kind: hit.kind, rect: e.rect, text, source: "dom" });
  }
  return found;
}

export type DetectPiiInput = {
  client: LlmClient;
  image: ImageInput;
  canvas: { width: number; height: number };
  dom?: DomSnapshot;
};

/** LLM の出力と DOM の検出を合わせ、重なる候補は 1 つにする（DOM の矩形を優先） */
export function mergePiiFindings(
  output: PiiOutput,
  input: Omit<DetectPiiInput, "client">,
): PiiCandidate[] {
  const scale = input.canvas.width / input.image.width;
  const fromDom = input.dom === undefined ? [] : detectPiiInDom(input.dom);
  const fromImage = output.findings.flatMap((f) => {
    const rect = toCanvasRect(f.box, scale, input.canvas);
    // 縮小した画像での推定なので、少し広げて文字の端を取りこぼさないようにする
    return rect === null
      ? []
      : [
          {
            kind: f.kind,
            rect: pad(rect, 2, input.canvas),
            text: f.text,
            source: "image" as const,
          },
        ];
  });
  const merged = [...fromDom];
  for (const f of fromImage) {
    if (!merged.some((m) => iou(m.rect, f.rect) > 0.3)) merged.push(f);
  }
  return toCandidates(merged);
}

/** 見つけた範囲に加工方法とダミー値を付ける。ダミー値は種類ごとの通し番号で変える */
function toCandidates(found: Omit<PiiCandidate, "replacement" | "method">[]): PiiCandidate[] {
  const counts = new Map<PiiKind, number>();
  return found.map((m) => {
    const n = counts.get(m.kind) ?? 0;
    counts.set(m.kind, n + 1);
    return candidate(m.kind, m.rect, m.text, m.source, n);
  });
}

/**
 * DOM のテキストだけで候補を作る（LLM を使わない。API キーがなくても使える）。
 * 画像に焼き込まれた文字や顔は見つけられないので、目での確認は要る
 */
export function detectPiiFromDom(dom: DomSnapshot): PiiCandidate[] {
  return toCandidates(detectPiiInDom(dom));
}

export async function detectPii(input: DetectPiiInput): Promise<PiiCandidate[]> {
  const output = await input.client.generate({
    system: SYSTEM,
    prompt: `画像の大きさ: ${input.image.width}x${input.image.height} ピクセル\n\nこの画像に写っている個人情報をすべて挙げてください。`,
    image: input.image,
    schema: PiiOutputSchema,
  });
  return mergePiiFindings(output, input);
}
