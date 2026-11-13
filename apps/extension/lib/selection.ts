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

/** 範囲の大きさを数値で決めたとき（FR-CAP-10）の一辺の上限（画像ピクセル） */
export const MAX_SELECT_SIDE = 8192;

/** 入力欄の文字を一辺の大きさ（画像ピクセル）にする。1〜上限の整数でなければ null */
export function parseSelectSide(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const v = Number(t);
  return v >= 1 && v <= MAX_SELECT_SIDE ? v : null;
}

/**
 * 大きさを決めた範囲（FR-CAP-10）を、カーソルの位置を左上にして置く。はみ出す分は内側へ寄せる。
 * size は画像ピクセルなので、CSS ピクセルに直して置く。ビューポートに収まらなければ null
 */
export function fixedRect(
  cursor: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  scale: number,
): CssRect | null {
  const w = size.width / scale;
  const h = size.height / scale;
  // 丸めで 1px はみ出すくらいは許す（ビューポートいっぱいの大きさを入れたとき）
  if (w > viewport.width + 0.5 || h > viewport.height + 0.5) return null;
  const x = Math.max(0, Math.min(cursor.x, viewport.width - w));
  const y = Math.max(0, Math.min(cursor.y, viewport.height - h));
  return { x, y, w: Math.min(w, viewport.width), h: Math.min(h, viewport.height) };
}

/** 点を含む矩形のうち、いちばん小さいもの（止めた画面で要素を選ぶとき。FR-CAP-11） */
export function smallestRectAt(rects: CssRect[], p: { x: number; y: number }): CssRect | null {
  let best: CssRect | null = null;
  for (const r of rects) {
    if (p.x < r.x || p.y < r.y || p.x > r.x + r.w || p.y > r.y + r.h) continue;
    if (r.w <= 0 || r.h <= 0) continue;
    if (best === null || r.w * r.h < best.w * best.h) best = r;
  }
  return best;
}
