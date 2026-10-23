// 画像の大きさ（新しいドキュメントの canvas を決めるため。FR-FILE-08）
import type { Bytes } from "./bytes";
import { isJpeg, jpegDpi, jpegSize } from "./jpeg";
import { isPng, pngDpi, pngSize } from "./png";

export type ImageSize = { width: number; height: number };

/** JPEG / PNG のヘッダから大きさを読む。読めない入力では例外を投げず null を返す。 */
export function readImageSize(bytes: Bytes): ImageSize | null {
  try {
    const size = isJpeg(bytes) ? jpegSize(bytes) : isPng(bytes) ? pngSize(bytes) : null;
    return size !== null && size.width > 0 && size.height > 0 ? size : null;
  } catch {
    return null;
  }
}

/**
 * 画像に記録された解像度（dpi）を読む。記録がない・読めないときは null。
 * 既定の線の太さ・文字サイズを画像の解像度に合わせるときの手がかりにする（FR-EDIT-16）
 */
export function readImageDpi(bytes: Bytes): number | null {
  try {
    const dpi = isJpeg(bytes) ? jpegDpi(bytes) : isPng(bytes) ? pngDpi(bytes) : null;
    return dpi !== null && Number.isFinite(dpi) && dpi > 0 ? dpi : null;
  } catch {
    return null;
  }
}
