// JPEG / PNG 以外の画像（SVG・WebP・GIF・AVIF・BMP・HEIC）を取り込めるようにする（FR-FILE-15, ADR-0016）
// 取り込むときに一度だけ JPEG / PNG に変換し、以後は普通の JPEG / PNG と同じに扱う。保存形式は増やさない
import {
  type ConvertibleImageType,
  IMPORTABLE_IMAGE_TYPES,
  type ImageType,
  sniffImageType,
} from "@harie/format";
import {
  createWasmDecoder,
  type ImageDecoder,
  ImportImageError,
  type LibHeif,
  type RgbaImage,
} from "@harie/render";
import { browserRenderer } from "./browser-renderer";
import { type LoadResult, loadFile } from "./load";
import { webMessages } from "./messages";

/** ファイルを選ぶ画面の絞り込み（`<input accept>` と showOpenFilePicker の types） */
export const IMAGE_ACCEPT: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const values of Object.values(IMPORTABLE_IMAGE_TYPES)) {
    const exts = values.filter((v) => v.startsWith("."));
    for (const mime of values.filter((v) => !v.startsWith("."))) out[mime] = exts;
  }
  return out;
})();

/** `<input type="file" accept>` に渡す文字列 */
export const IMAGE_ACCEPT_ATTR = Object.entries(IMAGE_ACCEPT)
  .flatMap(([mime, exts]) => [mime, ...exts])
  .join(",");

const MIME: Record<ConvertibleImageType, string> = {
  svg: "image/svg+xml",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  heic: "image/heic",
};

/** ブラウザの画像デコーダで読む。Chrome などは HEIC を読めないので、そのときは libheif（WASM）を初めて要ったときに読み込む */
const wasm = createWasmDecoder({
  heic: async () =>
    (await import("libheif-js/libheif-wasm/libheif-bundle.mjs")).default() as LibHeif,
});

async function decodeWithBrowser(bytes: Uint8Array, type: ConvertibleImageType) {
  // EXIF などの向きは画像の指定どおりに起こす
  const bitmap = await createImageBitmap(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[type] }),
    { imageOrientation: "from-image", premultiplyAlpha: "none", colorSpaceConversion: "default" },
  );
  try {
    const { width, height } = bitmap;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx === null) return null;
    ctx.drawImage(bitmap, 0, 0);
    const image: RgbaImage = { width, height, data: ctx.getImageData(0, 0, width, height).data };
    return image;
  } finally {
    bitmap.close();
  }
}

export const browserDecoder: ImageDecoder = async (bytes, type) => {
  try {
    const image = await decodeWithBrowser(bytes, type);
    if (image !== null) return image;
  } catch {
    // このブラウザでは読めない形式（Chrome の HEIC など）。WASM のデコーダを試す
  }
  return wasm(bytes, type);
};

export type PreparedImage =
  | { ok: true; bytes: Uint8Array; type: ImageType | null }
  | { ok: false; message: string };

/**
 * 開いた画像のバイト列を、エディタで扱える JPEG / PNG にする。JPEG / PNG（Harie ファイルを含む）と、
 * 形式が分からないもの（読み込み側でエラーにする）はそのまま返す
 */
export async function prepareImage(bytes: Uint8Array): Promise<PreparedImage> {
  const type = sniffImageType(bytes);
  if (type === null || type === "jpeg" || type === "png") return { ok: true, bytes, type };
  try {
    const renderer = await browserRenderer();
    const image = await renderer.importImage({ bytes, type, decode: browserDecoder });
    return { ok: true, bytes: image.bytes, type };
  } catch (e) {
    if (e instanceof ImportImageError) {
      return { ok: false, message: webMessages().load.decodeFailed(type.toUpperCase()) };
    }
    throw e;
  }
}

/** 画像ファイルを開く。JPEG / PNG 以外は変換してから開く（`loadFile` の非同期版） */
export async function loadImageFile(fileName: string, bytes: Uint8Array): Promise<LoadResult> {
  const prepared = await prepareImage(bytes);
  if (!prepared.ok) return prepared;
  return loadFile(fileName, prepared.bytes);
}
