/// <reference path="./libheif-js.d.ts" />
// JPEG / PNG 以外の画像を、ベース画像にできる JPEG / PNG に変換する（FR-FILE-15, ADR-0016）
// 変換は取り込むときの 1 回だけ。以後は変換後のバイト列をベース画像としてそのまま扱う（ADR-0004）。

/** 変換して取り込む形式（@harie/format の ConvertibleImageType と同じ） */
export type ConvertibleType = "svg" | "gif" | "webp" | "bmp" | "avif" | "heic";

/** 1 画素 4 バイト（RGBA、ストレートアルファ）のピクセル */
export type RgbaImage = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };

/**
 * SVG・GIF 以外の形式をピクセルにする。環境ごとに使えるデコーダが違う（ブラウザの画像デコーダ、WASM のデコーダ）ので、
 * 呼び出し側から受け取る。その形式を読めないときは null
 */
export type ImageDecoder = (bytes: Uint8Array, type: ConvertibleType) => Promise<RgbaImage | null>;

export class ImportImageError extends Error {
  constructor(
    readonly reason: "unsupported" | "decode-failed" | "too-large",
    message: string,
  ) {
    super(message);
    this.name = "ImportImageError";
  }
}

/** 変換後の形式。写真向けの形式（HEIC・AVIF）は JPEG、それ以外は劣化しない PNG にする */
export function importedMediaType(type: ConvertibleType): "image/jpeg" | "image/png" {
  return type === "heic" || type === "avif" ? "image/jpeg" : "image/png";
}

/** 変換後の大きさの上限（1 辺）。巨大な SVG で固まらないようにする */
export const MAX_IMPORT_SIDE = 8192;
/** SVG は大きさを自由に決められるので、小さすぎる SVG はこの長辺まで拡大して描く */
export const MIN_SVG_LONG_SIDE = 1024;

/** SVG の元の大きさから、描く大きさ（幅）を決める */
export function svgTargetWidth(width: number, height: number): number {
  const long = Math.max(width, height);
  if (!(long > 0)) throw new ImportImageError("decode-failed", "SVG の大きさを決められません");
  const scale = Math.min(Math.max(1, MIN_SVG_LONG_SIDE / long), MAX_IMPORT_SIDE / long);
  return Math.max(1, Math.round(width * scale));
}

/** GIF の論理画面の大きさ（ヘッダの 6〜9 バイト目、リトルエンディアン） */
export function gifSize(b: Uint8Array): { width: number; height: number } {
  if (b.length < 10) throw new ImportImageError("decode-failed", "GIF のヘッダを読めません");
  const width = (b[6] as number) | ((b[7] as number) << 8);
  const height = (b[8] as number) | ((b[9] as number) << 8);
  if (width === 0 || height === 0) {
    throw new ImportImageError("decode-failed", "GIF の大きさを読めません");
  }
  return { width, height };
}

/** RGBA を白地に合成した RGBA を返す（JPEG にするとき透過部分が黒くならないように） */
export function flattenOnWhite(img: RgbaImage): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  const d = img.data;
  for (let i = 0; i < out.length; i += 4) {
    const a = (d[i + 3] as number) / 255;
    out[i] = Math.round((d[i] as number) * a + 255 * (1 - a));
    out[i + 1] = Math.round((d[i + 1] as number) * a + 255 * (1 - a));
    out[i + 2] = Math.round((d[i + 2] as number) * a + 255 * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      c = (CRC_TABLE[(c ^ (p[i] as number)) & 0xff] as number) ^ (c >>> 8);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (v: number) =>
  new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);

function chunk(type: string, data: Uint8Array): Uint8Array[] {
  const t = new Uint8Array([...type].map((ch) => ch.charCodeAt(0)));
  return [u32(data.length), t, data, u32(crc32([t, data]))];
}

/**
 * RGBA を無圧縮（deflate の stored ブロック）の PNG にする。resvg に読ませて描き直すための中間形式で、
 * 保存するのは resvg が圧縮し直した PNG
 */
export function uncompressedPng(img: RgbaImage): Uint8Array {
  const { width, height, data } = img;
  const row = width * 4 + 1;
  const raw = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    // 各行の先頭はフィルタ種別 0（なし）
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * row + 1);
  }
  const MAX_BLOCK = 65535;
  const blocks = Math.max(1, Math.ceil(raw.length / MAX_BLOCK));
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78;
  z[1] = 0x01;
  let o = 2;
  for (let i = 0; i < blocks; i++) {
    const start = i * MAX_BLOCK;
    const len = Math.min(MAX_BLOCK, raw.length - start);
    z[o++] = i === blocks - 1 ? 1 : 0;
    z[o++] = len & 255;
    z[o++] = len >>> 8;
    z[o++] = ~len & 255;
    z[o++] = (~len >>> 8) & 255;
    z.set(raw.subarray(start, start + len), o);
    o += len;
  }
  let a = 1;
  let b = 0;
  for (let i = 0; i < raw.length; i++) {
    a = (a + (raw[i] as number)) % 65521;
    b = (b + a) % 65521;
  }
  z.set(u32(((b << 16) | a) >>> 0), o);
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", z),
    ...chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/** libheif-js（`libheif-js/libheif-wasm/libheif-bundle.mjs` の既定エクスポートを呼んだもの）のうち使う部分 */
export type LibHeif = {
  HeifDecoder: new () => {
    decode(bytes: Uint8Array): Array<{
      get_width(): number;
      get_height(): number;
      display(
        target: { data: Uint8ClampedArray; width: number; height: number },
        callback: (result: unknown) => void,
      ): void;
      free?(): void;
    }>;
  };
};

/** HEIC / HEIF の最初の画像（主画像）を RGBA にする。libheif は呼び出し側が読み込んで渡す */
export async function decodeHeif(libheif: LibHeif, bytes: Uint8Array): Promise<RgbaImage | null> {
  const images = new libheif.HeifDecoder().decode(bytes);
  const image = images[0];
  if (image === undefined) return null;
  try {
    const width = image.get_width();
    const height = image.get_height();
    const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
    const ok = await new Promise<boolean>((resolve) =>
      image.display(target, (result) => resolve(result !== null && result !== undefined)),
    );
    return ok ? { width, height, data: target.data } : null;
  } finally {
    for (const img of images) img.free?.();
  }
}

/**
 * WASM のデコーダで読む ImageDecoder を作る（ブラウザの画像デコーダがない Node 用。ブラウザでも HEIC の予備に使う）。
 * 読み込みは初めて要ったときだけ行う。渡さなかった形式は読めない（null）
 */
export function createWasmDecoder(loaders: {
  /** `@jsquash/webp/codec/dec/webp_dec.wasm` をコンパイルした Module */
  webp?: () => Promise<WebAssembly.Module>;
  /** HEIC を読む libheif-js の wasm 版（AV1 のデコーダは入っていないので AVIF は読めない）（`libheif-js/libheif-wasm/libheif-bundle.mjs` の既定エクスポートを呼んだもの） */
  heic?: () => Promise<LibHeif>;
}): ImageDecoder {
  let webp: Promise<(buffer: ArrayBuffer) => Promise<RgbaImage>> | undefined;
  let heif: Promise<LibHeif> | undefined;
  return async (bytes, type) => {
    if (type === "webp" && loaders.webp) {
      const load = loaders.webp;
      webp ??= (async () => {
        const mod = await import("@jsquash/webp/decode.js");
        await mod.init(await load());
        return mod.default;
      })();
      const copy = bytes.slice();
      return (await webp)(copy.buffer);
    }
    if (type === "heic" && loaders.heic) {
      heif ??= loaders.heic();
      return decodeHeif(await heif, bytes);
    }
    return null;
  };
}
