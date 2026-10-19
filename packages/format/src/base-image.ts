// 差し替え用の新しいベース画像を読む（FR-EDIT-10）
import type { Bytes } from "./bytes";
import { type BaseMediaType, readHarie } from "./harie-file";
import { readImageSize } from "./image-size";

export type BaseImage = {
  bytes: Bytes;
  mediaType: BaseMediaType;
  width: number;
  height: number;
};

/**
 * 画像をベース画像として読む。Harie ファイルなら、注釈を焼き込んだ画像ではなく埋め込みのベース画像を使う
 * （差し替えた先に古い注釈が二重に写らないように）。それ以外の JPEG / PNG はバイト列をそのまま使う（ADR-0004）。
 * JPEG / PNG として読めないときは null。
 */
export function readBaseImage(bytes: Bytes): BaseImage | null {
  const read = readHarie(bytes);
  if (read.kind === "unsupported" || read.kind === "corrupted") return null;
  const base =
    read.kind === "harie"
      ? read.base
      : { bytes, mediaType: (read.format === "png" ? "image/png" : "image/jpeg") as BaseMediaType };
  const size = readImageSize(base.bytes);
  return size === null ? null : { ...base, ...size };
}
