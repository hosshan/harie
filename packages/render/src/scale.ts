// 画像の解像度に合わせる倍率（FR-EDIT-16）。Retina などで撮った大きな画像でも、既定の線の太さ・文字サイズが
// 等倍の画面で撮ったときと同じ見た目になるようにする。値は新しく描く注釈の style に書き込むだけで、
// ドキュメントには倍率を持たない（既存のファイルの見た目は変わらない）
import { THEMES } from "./theme";

/** 画像の長い辺がこの幅のとき 1 倍とみなす（ノート PC の画面の幅） */
export const SCALE_REFERENCE_SIDE = 1440;
export const MAX_IMAGE_SCALE = 4;
/** 記録された dpi を信じる下限。72・96 などは多くのツールが既定で書くので、手がかりにしない */
const MIN_TRUSTED_DPI = 144;

export type ImageScaleHints = {
  /** 撮ったときの devicePixelRatio（Chrome 拡張でのキャプチャ） */
  devicePixelRatio?: number | undefined;
  /** 画像に記録された dpi（Mac のスクリーンショットは Retina で 144） */
  dpi?: number | null | undefined;
};

/** 0.5 刻みに丸め、1〜MAX_IMAGE_SCALE に収める */
function clampScale(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  return Math.min(MAX_IMAGE_SCALE, Math.max(1, Math.round(v * 2) / 2));
}

/**
 * 画像の 1px が、等倍の画面の何 px にあたるか。撮ったときの devicePixelRatio、記録された dpi（÷72）、
 * 画像の大きさ（長い辺 ÷ 1440 を切り捨て）の順に手がかりにする
 */
export function estimateImageScale(
  canvas: { width: number; height: number },
  hints: ImageScaleHints = {},
): number {
  const { devicePixelRatio, dpi } = hints;
  if (devicePixelRatio !== undefined && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0) {
    return clampScale(devicePixelRatio);
  }
  if (dpi !== undefined && dpi !== null && dpi >= MIN_TRUSTED_DPI) return clampScale(dpi / 72);
  const side = Math.max(canvas.width, canvas.height);
  return clampScale(Math.floor((side / SCALE_REFERENCE_SIDE) * 2) / 2);
}

/** テーマの既定の線の太さ・文字サイズに倍率を掛けた値 */
export function scaledDefaults(scale: number, theme = THEMES.default) {
  return {
    strokeWidth: Math.round(theme.defaults.strokeWidth * scale),
    fontSize: Math.round(theme.defaults.fontSize * scale),
  };
}
