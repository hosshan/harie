// PII 加工（ADR-0007, FR-EDIT-05, FR-PII-02〜04）
// ベース画像の上に「元のピクセルに依存しない不透明な図形」を重ねた SVG を作り、それを新しいベース画像にする。
// 重ねる図形の色は、塗りつぶし色・ブロック平均・周囲の背景色だけから決める。
// そのため加工後の範囲内のピクセルから、ブロック平均より細かい元の情報は復元できない。
import type { PiiApplied, PiiMask, Rect } from "@harie/model";
import { estimateTextWidth, FONT_FAMILY } from "./svg";
import { attrs, esc, n } from "./xml";

export type RgbaPixels = { width: number; height: number; data: Uint8Array };

/** モザイクの最小ブロック（px）。小さいブロックは文字の推定攻撃（depixelation）に弱い。 */
export const MIN_MOSAIC_BLOCK = 16;
/** 塗りつぶしの既定色 */
export const DEFAULT_FILL = "#1C2024";

/** 範囲を整数ピクセルの境界まで外側に広げ、画像内に収める。端の半端なピクセルに元の色が混ざらないようにする。 */
export function snapRect(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(width, Math.ceil(r.x + r.w));
  const y1 = Math.min(height, Math.ceil(r.y + r.h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** モザイク・ぼかしのブロックの大きさ。範囲が大きいほど粗くする。 */
export function blockSize(r: Rect, method: "mosaic" | "blur"): number {
  const divisor = method === "mosaic" ? 8 : 4;
  return Math.max(MIN_MOSAIC_BLOCK, Math.ceil(Math.min(r.w, r.h) / divisor));
}

const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0").toUpperCase();
const rgb = (r: number, g: number, b: number) => `#${hex(r)}${hex(g)}${hex(b)}`;

function average(px: RgbaPixels, r: Rect): string {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const o = (y * px.width + x) * 4;
      sr += px.data[o] as number;
      sg += px.data[o + 1] as number;
      sb += px.data[o + 2] as number;
    }
  }
  const count = r.w * r.h;
  return rgb(sr / count, sg / count, sb / count);
}

/** 範囲のすぐ外側 2px の帯で最も多い色（背景色の推定）。範囲の内側は見ない。 */
export function surroundingColor(px: RgbaPixels, r: Rect): string {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= px.width || y >= px.height) return;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return;
    const o = (y * px.width + x) * 4;
    const [cr, cg, cb] = [px.data[o] as number, px.data[o + 1] as number, px.data[o + 2] as number];
    const key = ((cr >> 4) << 8) | ((cg >> 4) << 4) | (cb >> 4);
    const b = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    b.count++;
    b.r += cr;
    b.g += cg;
    b.b += cb;
    buckets.set(key, b);
  };
  for (let y = r.y - 2; y < r.y + r.h + 2; y++) {
    for (let x = r.x - 2; x < r.x + r.w + 2; x++) visit(x, y);
  }
  let best: { count: number; r: number; g: number; b: number } | undefined;
  for (const b of buckets.values()) if (best === undefined || b.count > best.count) best = b;
  if (best === undefined) return "#FFFFFF";
  return rgb(best.r / best.count, best.g / best.count, best.b / best.count);
}

function contrastText(background: string): string {
  const v = Number.parseInt(background.slice(1, 7), 16);
  const lum = (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
  return lum > 0.5 ? "#1C2024" : "#FFFFFF";
}

function mosaicRects(px: RgbaPixels, r: Rect, block: number): string {
  let out = "";
  for (let y = r.y; y < r.y + r.h; y += block) {
    for (let x = r.x; x < r.x + r.w; x += block) {
      const cell = { x, y, w: Math.min(block, r.x + r.w - x), h: Math.min(block, r.y + r.h - y) };
      out += `<rect ${attrs({ x: cell.x, y: cell.y, width: cell.w, height: cell.h, fill: average(px, cell) })}/>`;
    }
  }
  return out;
}

function overlay(px: RgbaPixels, mask: PiiMask, r: Rect, index: number): string {
  const box = { x: r.x, y: r.y, width: r.w, height: r.h };
  switch (mask.method) {
    case "fill":
      return `<rect ${attrs({ ...box, fill: mask.color ?? DEFAULT_FILL })}/>`;
    case "mosaic":
      return mosaicRects(px, r, blockSize(r, "mosaic"));
    case "blur": {
      // ブロック平均だけを材料にぼかす。下に同じモザイクを不透明に敷き、ぼかしの縁が半透明でも元画像が透けないようにする
      const block = blockSize(r, "blur");
      const cells = mosaicRects(px, r, block);
      const id = `pii-${index}`;
      return `<clipPath id="${id}-clip"><rect ${attrs(box)}/></clipPath><filter id="${id}-f" ${attrs({ ...box, filterUnits: "userSpaceOnUse" })}><feGaussianBlur stdDeviation="${n(block * 0.6)}" edgeMode="duplicate"/></filter><g>${cells}</g><g clip-path="url(#${id}-clip)"><g filter="url(#${id}-f)">${cells}</g></g>`;
    }
    case "replace": {
      // 元の文字を周囲の背景色で消し、ダミーの文字を描く（FR-PII-02）
      const background = surroundingColor(px, r);
      const erase = `<rect ${attrs({ ...box, fill: background })}/>`;
      const text = mask.replacement ?? "";
      if (text === "") return erase;
      const pad = r.h * 0.15;
      const fontSize = Math.min(r.h * 0.7, (r.w - pad * 2) / estimateTextWidth(text, 1));
      return `${erase}<text ${attrs({
        x: r.x + pad,
        y: r.y + r.h / 2 + fontSize * 0.35,
        "font-family": FONT_FAMILY,
        "font-size": fontSize,
        fill: mask.color ?? contrastText(background),
      })}>${esc(text)}</text>`;
    }
  }
}

export type MaskPlan = { svg: string; applied: PiiApplied[] };

/**
 * 加工後のベース画像を描く SVG を作る。`pixels` は加工前のベース画像を同じ大きさでラスタライズしたもの。
 * 画像の外にはみ出した範囲は画像内に切り詰め、完全に外にある指示は無視する（記録もしない）。
 */
export function planMasks(
  pixels: RgbaPixels,
  baseImageHref: string,
  masks: readonly PiiMask[],
): MaskPlan {
  const { width, height } = pixels;
  const applied: PiiApplied[] = [];
  let body = "";
  masks.forEach((mask, i) => {
    const r = snapRect(mask.rect, width, height);
    if (r === null) return;
    // crispEdges で縁の補間（アンチエイリアス）を切り、範囲の内側を完全に覆う
    body += `<g shape-rendering="crispEdges">${overlay(pixels, mask, r, i)}</g>`;
    applied.push({ kind: mask.kind, method: mask.method, rect: r });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${attrs({ width, height, viewBox: `0 0 ${width} ${height}` })}><image ${attrs({ href: baseImageHref, x: 0, y: 0, width, height, preserveAspectRatio: "none" })}/>${body}</svg>`;
  return { svg, applied };
}
