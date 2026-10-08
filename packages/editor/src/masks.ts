// 個人情報のマスク（FR-EDIT-05）。範囲は注釈ではなく「適用前の下書き」としてエディタだけが持つ。
// 適用するとベース画像そのものを書き換え（ADR-0007）、ドキュメントには種別・方法・範囲の記録だけが残る
import type { PiiMask, PiiMethod, Point, Rect } from "@harie/model";
import { boxFrom } from "./geometry";

export type MaskDraft = { id: string; rect: Rect; method: PiiMethod; replacement: string };

export const MASK_METHODS: { method: PiiMethod; label: string }[] = [
  { method: "fill", label: "塗りつぶし" },
  { method: "replace", label: "ダミーの文字に置き換え" },
  { method: "mosaic", label: "モザイク" },
  { method: "blur", label: "ぼかし" },
];

/** 文字の加工は塗りつぶしかダミー置換を既定にする（ADR-0007。モザイクは文字を推定されうる） */
export const DEFAULT_MASK_METHOD: PiiMethod = "fill";

/** クリックだけで作ったときの大きさ（1 行の文字を覆う程度） */
const DEFAULT_MASK = { w: 160, h: 32 };
const MIN_DRAG = 4;

/** ドラッグした 2 点から、画像内に収めたマスク範囲を作る。画像の外だけなら null */
export function maskRect(
  start: Point,
  end: Point,
  canvas: { width: number; height: number },
): Rect | null {
  const short = Math.abs(end.x - start.x) < MIN_DRAG && Math.abs(end.y - start.y) < MIN_DRAG;
  const box = short
    ? { x: Math.round(start.x), y: Math.round(start.y), ...DEFAULT_MASK }
    : boxFrom(start, end);
  const x0 = Math.max(0, box.x);
  const y0 = Math.max(0, box.y);
  const x1 = Math.min(canvas.width, box.x + box.w);
  const y1 = Math.min(canvas.height, box.y + box.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function newMaskDraft(drafts: readonly MaskDraft[], rect: Rect): MaskDraft {
  let n = drafts.length + 1;
  while (drafts.some((d) => d.id === `mask-${n}`)) n++;
  return { id: `mask-${n}`, rect, method: DEFAULT_MASK_METHOD, replacement: "" };
}

/** 適用の指示に変える。手で指定した範囲なので種別は other */
export function toPiiMasks(drafts: readonly MaskDraft[]): PiiMask[] {
  return drafts.map((d) => ({
    kind: "other",
    method: d.method,
    rect: d.rect,
    ...(d.method === "replace" && d.replacement !== "" ? { replacement: d.replacement } : {}),
  }));
}
