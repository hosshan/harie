// DOM スナップショット（integrations.md 1.3）。Chrome 拡張が撮影と同時に取る。
// 外部入力なので zod で検証してから使う。ファイルには保存しない
import { type Rect, RectSchema } from "@harie/model";
import { z } from "zod";
import { iou } from "./geometry";

export const DomElementSchema = z.object({
  /** 画像ピクセル座標に変換済み */
  rect: RectSchema,
  role: z.string().max(64),
  name: z.string().max(500).optional(),
  text: z.string().max(500).optional(),
  piiHint: z.enum(["email", "phone", "name", "address", "id"]).nullable().optional(),
});
export type DomElement = z.infer<typeof DomElementSchema>;

export const DomSnapshotSchema = z.object({
  url: z.string().max(2000),
  viewport: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    devicePixelRatio: z.number().positive(),
  }),
  elements: z.array(DomElementSchema).max(2000),
});
export type DomSnapshot = z.infer<typeof DomSnapshotSchema>;

/** LLM に渡す要素の数の上限（プロンプトが長くなりすぎないように） */
export const MAX_PROMPT_ELEMENTS = 300;

/** プロンプトに載せる要素の一覧。番号で指してもらう */
export function describeElements(elements: readonly DomElement[], scale: number): string {
  return elements
    .slice(0, MAX_PROMPT_ELEMENTS)
    .map((e, i) => {
      const r = e.rect;
      const label = [e.name, e.text].filter((s) => s !== undefined && s !== "").join(" / ");
      return `${i}: ${e.role} (${Math.round(r.x / scale)}, ${Math.round(r.y / scale)}, ${Math.round(r.w / scale)}x${Math.round(r.h / scale)}) ${label.slice(0, 80)}`;
    })
    .join("\n");
}

/** 推定した範囲に最もよく重なる要素の矩形（FR-AI-03）。十分に重ならなければ null */
export function snapToElement(
  rect: Rect,
  elements: readonly DomElement[],
  threshold = 0.3,
): Rect | null {
  let best: Rect | null = null;
  let bestScore = threshold;
  for (const e of elements) {
    const score = iou(rect, e.rect);
    if (score >= bestScore) {
      best = e.rect;
      bestScore = score;
    }
  }
  return best;
}
