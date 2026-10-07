// PNG コンテナ（docs/03-design/anoi-format-spec.md §5）
import { ascii, type Bytes, concat, fromAscii, readU32, startsWith, u32 } from "./bytes";
import { crc32 } from "./crc32";

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const XMP_KEYWORD = "XML:com.adobe.xmp";
/** 補助・私用・コピー安全チャンク。中身は JUMBF superbox 1 つ。 */
export const ANOI_CHUNK = "anOi";

type Chunk = { type: string; start: number; end: number; data: Bytes };

export function isPng(b: Bytes): boolean {
  return startsWith(b, SIGNATURE);
}

function chunks(png: Bytes): Chunk[] {
  if (!isPng(png)) throw new RangeError("not a PNG");
  const out: Chunk[] = [];
  let p = SIGNATURE.length;
  while (p < png.length) {
    const len = readU32(png, p);
    const end = p + 12 + len;
    if (end > png.length) throw new RangeError("invalid chunk length");
    const type = fromAscii(png.subarray(p + 4, p + 8));
    out.push({ type, start: p, end, data: png.subarray(p + 8, p + 8 + len) });
    p = end;
    if (type === "IEND") break;
  }
  return out;
}

function chunk(type: string, data: Bytes): Bytes {
  const typeAndData = concat([ascii(type), data]);
  return concat([u32(data.length), typeAndData, u32(crc32(typeAndData))]);
}

function isXmpChunk(c: Chunk): boolean {
  return c.type === "iTXt" && startsWith(c.data, ascii(`${XMP_KEYWORD}\0`));
}

/** 外部ツールの再エンコード検出用: 全 IDAT の連結。 */
export function pngRenderData(png: Bytes): Bytes {
  return concat(
    chunks(png)
      .filter((c) => c.type === "IDAT")
      .map((c) => c.data),
  );
}

/**
 * レンダリング画像に XMP（iTXt）と anOi チャンクを埋め込み、最初の IDAT の前に置く。
 * 既存の XMP・anOi・eXIf は除く。
 */
export function embedPng(rendered: Bytes, xmp: Bytes, superboxes: readonly Bytes[]): Bytes {
  const all = chunks(rendered);
  const firstIdat = all.findIndex((c) => c.type === "IDAT");
  if (firstIdat < 0) throw new RangeError("IDAT not found");
  const keep = (c: Chunk) => !isXmpChunk(c) && c.type !== ANOI_CHUNK && c.type !== "eXIf";
  const raw = (c: Chunk) => rendered.subarray(c.start, c.end);
  // iTXt: keyword\0 compression-flag(0) method(0) language\0 translated\0 text
  const itxt = concat([ascii(`${XMP_KEYWORD}\0`), Uint8Array.of(0, 0, 0, 0), xmp]);
  return concat([
    SIGNATURE,
    ...all.slice(0, firstIdat).filter(keep).map(raw),
    chunk("iTXt", itxt),
    ...superboxes.map((sb) => chunk(ANOI_CHUNK, sb)),
    ...all.slice(firstIdat).filter(keep).map(raw),
  ]);
}

export function extractPng(png: Bytes): { xmp: Bytes | null; superboxes: Bytes[] } {
  let xmp: Bytes | null = null;
  const superboxes: Bytes[] = [];
  for (const c of chunks(png)) {
    if (isXmpChunk(c) && xmp === null) {
      // keyword\0 + flag + method + language\0 + translated\0
      let p = XMP_KEYWORD.length + 1 + 2;
      p = c.data.indexOf(0, p) + 1;
      p = c.data.indexOf(0, p) + 1;
      if (p > 0 && c.data[XMP_KEYWORD.length + 1] === 0) xmp = c.data.subarray(p);
    }
    if (c.type === ANOI_CHUNK) superboxes.push(c.data);
  }
  return { xmp, superboxes };
}
