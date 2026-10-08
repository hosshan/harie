// DOM スナップショットの座標変換（integrations.md 1.3）。ページで取った CSS ピクセルの値を、
// キャプチャ画像（切り抜いた場合はその中）のピクセル座標に直し、@harie/ai のスキーマで検証する
import { type DomSnapshot, DomSnapshotSchema } from "@harie/ai";

export type CssRect = { x: number; y: number; w: number; h: number };

export type RawElement = {
  /** ビューポート基準の CSS ピクセル */
  rect: CssRect;
  role: string;
  name?: string;
  text?: string;
  piiHint?: "email" | "phone" | "name" | "address" | "id" | null;
};

export type RawSnapshot = {
  url: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
  elements: RawElement[];
};

const MAX_TEXT = 500;
/** 切り抜きの外にはみ出した要素は、この割合以上が中に残っていれば残す */
const MIN_VISIBLE = 0.5;

/** 画像の範囲（切り抜きを CSS ピクセルで指定）を、画像ピクセルの整数矩形にする */
export function toImageRect(
  crop: CssRect,
  scale: number,
  image: { width: number; height: number },
): CssRect {
  const x = Math.max(0, Math.floor(crop.x * scale));
  const y = Math.max(0, Math.floor(crop.y * scale));
  const x1 = Math.min(image.width, Math.ceil((crop.x + crop.w) * scale));
  const y1 = Math.min(image.height, Math.ceil((crop.y + crop.h) * scale));
  return { x, y, w: Math.max(0, x1 - x), h: Math.max(0, y1 - y) };
}

/**
 * @param scale キャプチャ画像のピクセル ÷ CSS ピクセル（通常は devicePixelRatio）
 * @param crop 切り抜いた範囲（画像ピクセル）。null なら画像全体
 */
export function toImageSnapshot(
  raw: RawSnapshot,
  scale: number,
  crop: CssRect | null,
  image: { width: number; height: number },
): DomSnapshot {
  const origin = crop ?? { x: 0, y: 0, w: image.width, h: image.height };
  const elements = raw.elements.flatMap((e) => {
    const x0 = e.rect.x * scale - origin.x;
    const y0 = e.rect.y * scale - origin.y;
    const x1 = x0 + e.rect.w * scale;
    const y1 = y0 + e.rect.h * scale;
    const cx0 = Math.max(0, x0);
    const cy0 = Math.max(0, y0);
    const cx1 = Math.min(origin.w, x1);
    const cy1 = Math.min(origin.h, y1);
    const area = (x1 - x0) * (y1 - y0);
    if (cx1 <= cx0 || cy1 <= cy0 || area <= 0) return [];
    if (((cx1 - cx0) * (cy1 - cy0)) / area < MIN_VISIBLE) return [];
    return [
      {
        rect: {
          x: Math.round(cx0),
          y: Math.round(cy0),
          w: Math.round(cx1 - cx0),
          h: Math.round(cy1 - cy0),
        },
        role: e.role.slice(0, 64),
        ...(e.name ? { name: e.name.slice(0, MAX_TEXT) } : {}),
        ...(e.text ? { text: e.text.slice(0, MAX_TEXT) } : {}),
        ...(e.piiHint ? { piiHint: e.piiHint } : {}),
      },
    ];
  });
  return DomSnapshotSchema.parse({
    url: raw.url.slice(0, 2000),
    viewport: raw.viewport,
    elements: elements.slice(0, 2000),
  });
}

/** キャプチャのファイル名（例: app-example-com-20261008-123000.png）。保存時に .harie が付く */
export function captureFileName(url: string, now: Date): string {
  let host = "capture";
  try {
    host = new URL(url).hostname.replace(/[^A-Za-z0-9-]+/g, "-") || "capture";
  } catch {
    // URL でない（about:blank など）
  }
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${host}-${stamp}.png`;
}
