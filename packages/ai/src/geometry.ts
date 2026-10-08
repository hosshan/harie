// LLM・DOM から来た範囲を、画像（キャンバス）の座標にそろえる
import type { Rect } from "@harie/model";

/** LLM の出力の範囲。縦横の名前は LLM に分かりやすい width / height にしている */
export type Box = { x: number; y: number; width: number; height: number };

/** LLM に送った画像の座標 → キャンバスの座標。整数に丸め、キャンバス内に切り詰める。範囲が残らなければ null */
export function toCanvasRect(
  box: Box,
  scale: number,
  canvas: { width: number; height: number },
): Rect | null {
  const x0 = Math.max(0, Math.round(box.x * scale));
  const y0 = Math.max(0, Math.round(box.y * scale));
  const x1 = Math.min(canvas.width, Math.round((box.x + box.width) * scale));
  const y1 = Math.min(canvas.height, Math.round((box.y + box.height) * scale));
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function iou(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

export function pad(r: Rect, by: number, canvas: { width: number; height: number }): Rect {
  const x = Math.max(0, r.x - by);
  const y = Math.max(0, r.y - by);
  return {
    x,
    y,
    w: Math.min(canvas.width, r.x + r.w + by) - x,
    h: Math.min(canvas.height, r.y + r.h + by) - y,
  };
}
