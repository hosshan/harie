// 画像の大きさ（新しいドキュメントの canvas を決めるため。FR-FILE-08）
import type { Bytes } from "./bytes";
import { isJpeg, jpegSize } from "./jpeg";
import { isPng, pngSize } from "./png";

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
