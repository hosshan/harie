// 範囲選択・要素選択の計算（ページの中のオーバーレイから使う）
import type { CssRect } from "./snapshot";

/** ドラッグの 2 点から、ビューポート内に収めた矩形を作る。小さすぎれば null */
export function dragRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  viewport: { width: number; height: number },
  min = 8,
): CssRect | null {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const x1 = Math.min(viewport.width, Math.max(a.x, b.x));
  const y1 = Math.min(viewport.height, Math.max(a.y, b.y));
  if (x1 - x0 < min || y1 - y0 < min) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 要素の矩形に余白を付け、ビューポート内に収める（ガイドでは要素の周りも少し写したい） */
export function elementRect(
  r: CssRect,
  viewport: { width: number; height: number },
  padding = 8,
): CssRect | null {
  return dragRect(
    { x: r.x - padding, y: r.y - padding },
    { x: r.x + r.w + padding, y: r.y + r.h + padding },
    viewport,
    1,
  );
}
