// 読み込んだファイルの画像形式を中身から判定する（FR-FILE-15）
// JPEG / PNG 以外は、取り込むときに一度だけ JPEG / PNG に変換してからベース画像にする（ADR-0016）
import type { Bytes } from "./bytes";
import { isJpeg } from "./jpeg";
import { isPng } from "./png";

/** 取り込める画像の形式。jpeg / png 以外は変換が要る */
export type ImageType = "jpeg" | "png" | "svg" | "gif" | "webp" | "bmp" | "avif" | "heic";

/** 変換してから取り込む形式 */
export type ConvertibleImageType = Exclude<ImageType, "jpeg" | "png">;

/** 取り込める形式の MIME タイプと拡張子。ファイルを選ぶ画面の絞り込みに使う */
export const IMPORTABLE_IMAGE_TYPES: Readonly<Record<ImageType, readonly string[]>> = {
  jpeg: ["image/jpeg", ".jpg", ".jpeg"],
  png: ["image/png", ".png"],
  svg: ["image/svg+xml", ".svg"],
  gif: ["image/gif", ".gif"],
  webp: ["image/webp", ".webp"],
  bmp: ["image/bmp", ".bmp"],
  avif: ["image/avif", ".avif"],
  heic: ["image/heic", "image/heif", ".heic", ".heif"],
};

const ascii = (b: Bytes, start: number, length: number) =>
  String.fromCharCode(...b.subarray(start, start + length));

/** ISO BMFF（HEIF / AVIF）の ftyp ボックスから、主ブランドと互換ブランドを読む */
function ftypBrands(b: Bytes): string[] | null {
  if (b.length < 16 || ascii(b, 4, 4) !== "ftyp") return null;
  const size = ((b[0] ?? 0) << 24) | ((b[1] ?? 0) << 16) | ((b[2] ?? 0) << 8) | (b[3] ?? 0);
  const end = Math.min(b.length, size >>> 0);
  const brands = [ascii(b, 8, 4)];
  for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(b, i, 4));
  return brands;
}

const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

/** テキストとして先頭を読み、ルート要素が svg かを見る（XML 宣言・コメント・DOCTYPE は飛ばす） */
function isSvg(b: Bytes): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, 4096));
  const rest = head
    .replace(/^﻿/, "")
    .replace(/^(\s|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i, "");
  return /^<svg[\s>]/i.test(rest);
}

/** 中身から画像形式を判定する。分からないときは null（拡張子や MIME タイプは信用しない） */
export function sniffImageType(b: Bytes): ImageType | null {
  if (isJpeg(b)) return "jpeg";
  if (isPng(b)) return "png";
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "gif";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) return "bmp";
  const brands = ftypBrands(b);
  if (brands !== null) {
    // AVIF は mif1 も名乗るので、avif / avis を先に見る
    if (brands[0] === "avif" || brands[0] === "avis") return "avif";
    if (brands.some((x) => HEIF_BRANDS.has(x))) {
      return brands.includes("avif") &&
        !brands.some((x) => x.startsWith("hei") || x.startsWith("hev"))
        ? "avif"
        : "heic";
    }
    if (brands.includes("avif")) return "avif";
    return null;
  }
  if (isSvg(b)) return "svg";
  return null;
}
