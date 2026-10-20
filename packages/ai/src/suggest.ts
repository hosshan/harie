// AI による補足の提案（FR-AI-01〜03, architecture 3.3）。
// 画像と「何を説明したいか」から、強調する範囲と説明文を提案させ、提案中（status: "suggested"）の注釈にする
import { type Annotation, AnnotationSchema, type HarieDocument } from "@harie/model";
import { annotationBounds, calloutWidth, placeCallout } from "@harie/render";
import { z } from "zod";
import { type DomSnapshot, describeElements, MAX_PROMPT_ELEMENTS, snapToElement } from "./dom";
import { pad, toCanvasRect } from "./geometry";
import { GUIDE_TARGET_RULE, GUIDE_TEXT_RULES, MAX_SUGGESTIONS, MAX_TEXT_LENGTH } from "./guide";
import { AiError, type ImageInput, type LlmClient } from "./llm";

/** LLM の出力。数値の範囲などの細かい検証は受け取った後で行う */
export const SuggestOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      /** 強調する UI 要素の範囲（送った画像のピクセル座標） */
      target: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
      /** DOM 要素の一覧を渡したとき、対応する要素の番号。なければ null */
      elementIndex: z.number().int().nullable(),
      /** 利用者向けの説明文 */
      text: z.string(),
    }),
  ),
});
export type SuggestOutput = z.infer<typeof SuggestOutputSchema>;

const SYSTEM = `あなたは SaaS の利用ガイドを書くテクニカルライターです。
画面のスクリーンショットと「何を説明したいか」を受け取り、読者が迷わず操作できるよう、画像のどこを強調し、どんな説明文を添えるべきかを提案します。

${[
  GUIDE_TARGET_RULE,
  "target はその要素をちょうど囲む矩形。座標は渡した画像のピクセル（左上が原点）で答える。",
  ...GUIDE_TEXT_RULES,
]
  .map((rule) => `- ${rule}`)
  .join("\n")}`;

export type SuggestInput = {
  client: LlmClient;
  /** LLM に送る画像（キャンバスを縮小したもの） */
  image: ImageInput;
  doc: HarieDocument;
  /** 何を説明したいか（利用者の入力） */
  intent: string;
  /**
   * 説明文を書く言語（エディタの表示言語）。省略すると日本語（システムプロンプトの決まりのまま）。
   * 英語は同じ文字数だと短すぎるので、上限を 2 倍にする
   */
  language?: "ja" | "en";
  dom?: DomSnapshot;
};

/** 説明文の文字数の上限（言語ごと） */
function maxTextLength(language: SuggestInput["language"]): number {
  return language === "en" ? MAX_TEXT_LENGTH * 2 : MAX_TEXT_LENGTH;
}

export type Suggestion = {
  /** 提案 1 件の注釈（強調枠と吹き出し）。まとめて採用・却下する */
  annotations: Annotation[];
  text: string;
};

function existingSummary(doc: HarieDocument): string {
  const lines = doc.annotations
    .filter((a) => a.status !== "suggested")
    .map((a) => {
      const b = annotationBounds(a);
      const text = a.type === "text" || a.type === "callout" ? ` 「${a.text.slice(0, 40)}」` : "";
      return `- ${a.type} (${Math.round(b.x)}, ${Math.round(b.y)}, ${Math.round(b.w)}x${Math.round(b.h)})${text}`;
    });
  return lines.length === 0 ? "なし" : lines.join("\n");
}

export function buildSuggestPrompt(input: Omit<SuggestInput, "client">): string {
  const { image, doc, intent, dom, language } = input;
  const scale = doc.canvas.width / image.width;
  const parts = [
    ...(language === "en"
      ? [
          `説明文（text）は日本語ではなく英語で書く（1〜2 文、${maxTextLength(language)} 文字以内）。「Click Save.」のように、読者がすることを具体的に書く。`,
        ]
      : []),
    `画像の大きさ: ${image.width}x${image.height} ピクセル`,
    `説明したいこと: ${intent.trim() === "" ? "（指定なし。この画面の主な操作）" : intent.trim()}`,
    `既に付いている注釈（座標は元画像の ${doc.canvas.width}x${doc.canvas.height} ピクセル）:\n${existingSummary(doc)}`,
  ];
  if (dom !== undefined && dom.elements.length > 0) {
    parts.push(
      `画面の要素（番号: 役割 (x, y, 幅x高さ) 名前）。target に対応する要素があれば elementIndex にその番号を入れる:\n${describeElements(dom.elements, scale)}`,
    );
  }
  return parts.join("\n\n");
}

function uniqueId(base: string, taken: Set<string>): string {
  let n = 1;
  while (taken.has(`${base}-${n}`)) n++;
  const id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * LLM の出力を、提案中の注釈に変える。座標をキャンバスに戻し、DOM 要素があればその矩形に合わせる（FR-AI-03）。
 * 範囲が画像の外・空の文などの提案は捨てる。
 */
export function toSuggestions(
  output: SuggestOutput,
  input: Omit<SuggestInput, "client" | "intent">,
): Suggestion[] {
  const { doc, image, dom, language } = input;
  const canvas = doc.canvas;
  const scale = canvas.width / image.width;
  const elements = dom?.elements.slice(0, MAX_PROMPT_ELEMENTS) ?? [];
  const taken = new Set(doc.annotations.map((a) => a.id));
  const width = calloutWidth(canvas);
  const result: Suggestion[] = [];

  for (const s of output.suggestions.slice(0, MAX_SUGGESTIONS)) {
    const text = s.text.trim().slice(0, maxTextLength(language));
    if (text === "") continue;
    const estimated = toCanvasRect(s.target, scale, canvas);
    if (estimated === null) continue;
    const indexed = s.elementIndex === null ? undefined : elements[s.elementIndex];
    const snapped = indexed?.rect ?? snapToElement(estimated, elements) ?? estimated;
    const box = pad(snapped, 4, canvas);

    const boxId = uniqueId("ai-box", taken);
    const noteId = uniqueId("ai-note", taken);
    const draftNote = { id: noteId, type: "callout" as const, x: 0, y: 0, w: width, text };
    const size = annotationBounds(draftNote);
    const at = placeCallout(box, { w: size.w, h: size.h }, canvas);
    const candidates = [
      { id: boxId, type: "rect", ...box, status: "suggested" },
      {
        ...draftNote,
        x: Math.round(at.x),
        y: Math.round(at.y),
        status: "suggested",
        anchor: { annotationId: boxId, side: at.side },
      },
    ];
    const annotations = candidates.map((a) => AnnotationSchema.safeParse(a));
    if (annotations.every((a) => a.success)) {
      result.push({ annotations: annotations.map((a) => a.data as Annotation), text });
    }
  }
  return result;
}

export async function suggestAnnotations(input: SuggestInput): Promise<Suggestion[]> {
  const output = await input.client.generate({
    system: SYSTEM,
    prompt: buildSuggestPrompt(input),
    image: input.image,
    schema: SuggestOutputSchema,
  });
  const suggestions = toSuggestions(output, input);
  if (output.suggestions.length > 0 && suggestions.length === 0) {
    throw new AiError("提案の範囲を画像の中に見つけられませんでした", "invalid-output");
  }
  return suggestions;
}
