// JPEG コンテナ（docs/03-design/harie-format-spec.md §4）
import { ascii, type Bytes, concat, readU16, readU32, startsWith, u16, u32 } from "./bytes";

const SOI = 0xffd8;
const SOS = 0xffda;
const APP0 = 0xffe0;
const APP1 = 0xffe1;
const APP11 = 0xffeb;
const XMP_HEADER = ascii("http://ns.adobe.com/xap/1.0/\0");
const JP = ascii("JP");
const JFIF = ascii("JFIF\0");
/** セグメント本体の上限（長さフィールド 2 バイトを除く）。 */
const MAX_SEGMENT_DATA = 0xffff - 2;
/** APP11 のヘッダ: CI(2) + En(2) + Z(4) + LBox(4) + TBox(4) */
const APP11_HEADER = 16;
export const MAX_APP11_CHUNK = MAX_SEGMENT_DATA - APP11_HEADER;

type Segment = { marker: number; start: number; end: number; data: Bytes };

export function isJpeg(b: Bytes): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/** SOS より前のマーカーセグメントと、SOS 以降（圧縮データ〜EOI）の開始位置を返す。 */
function scan(jpeg: Bytes): { segments: Segment[]; scanStart: number } {
  if (readU16(jpeg, 0) !== SOI) throw new RangeError("not a JPEG");
  const segments: Segment[] = [];
  let p = 2;
  while (p < jpeg.length) {
    // マーカー前の詰め物 0xFF を読み飛ばす
    while (jpeg[p] === 0xff && jpeg[p + 1] === 0xff) p++;
    const marker = readU16(jpeg, p);
    if ((marker & 0xff00) !== 0xff00) throw new RangeError("invalid marker");
    if (marker === SOS) return { segments, scanStart: p };
    const len = readU16(jpeg, p + 2);
    if (len < 2 || p + 2 + len > jpeg.length) throw new RangeError("invalid segment length");
    segments.push({ marker, start: p, end: p + 2 + len, data: jpeg.subarray(p + 4, p + 2 + len) });
    p += 2 + len;
  }
  throw new RangeError("SOS not found");
}

function segment(marker: number, data: Bytes): Bytes {
  if (data.length > MAX_SEGMENT_DATA) throw new RangeError("segment too large");
  return concat([u16(marker), u16(data.length + 2), data]);
}

/** JUMBF superbox を APP11 セグメント列に分割する（C2PA と同じ規則）。 */
function app11Segments(superbox: Bytes, instance: number): Bytes[] {
  const lboxTbox = superbox.subarray(0, 8);
  const body = superbox.subarray(8);
  const count = Math.max(1, Math.ceil(body.length / MAX_APP11_CHUNK));
  return Array.from({ length: count }, (_, i) => {
    const part = body.subarray(i * MAX_APP11_CHUNK, (i + 1) * MAX_APP11_CHUNK);
    return segment(APP11, concat([JP, u16(instance), u32(i + 1), lboxTbox, part]));
  });
}

/** 外部ツールの再エンコード検出用: 圧縮データ（最初の SOS から末尾まで）。 */
export function jpegRenderData(jpeg: Bytes): Bytes {
  return jpeg.subarray(scan(jpeg).scanStart);
}

/**
 * レンダリング画像に XMP と JUMBF を埋め込む。
 * 既存の APP1（EXIF / XMP）と APP11 は除く（EXIF は既定で書かない: 位置情報等の漏れ防止）。
 * 他の APPn（JFIF, ICC, Adobe 等）と画像データは変更しない。
 */
export function embedJpeg(
  rendered: Bytes,
  xmp: Bytes,
  superboxes: readonly Bytes[],
  firstInstance: number,
): Bytes {
  const { segments, scanStart } = scan(rendered);
  const kept = segments
    .filter((s) => s.marker !== APP1 && s.marker !== APP11)
    .map((s) => rendered.subarray(s.start, s.end));
  // JFIF(APP0) があれば先頭に置き、その直後に XMP と JUMBF を入れる
  const app0 = kept.filter((s) => readU16(s, 0) === 0xffe0);
  const rest = kept.filter((s) => readU16(s, 0) !== 0xffe0);
  return concat([
    u16(SOI),
    ...app0,
    segment(APP1, concat([XMP_HEADER, xmp])),
    ...superboxes.flatMap((sb, i) => app11Segments(sb, firstInstance + i)),
    ...rest,
    rendered.subarray(scanStart),
  ]);
}

export type JpegExtract = { xmp: Bytes | null; superboxes: Bytes[] };

/** XMP と、APP11 から再構成した JUMBF superbox 群を取り出す。 */
export function extractJpeg(jpeg: Bytes): JpegExtract {
  const { segments } = scan(jpeg);
  let xmp: Bytes | null = null;
  const instances = new Map<number, { header: Bytes; parts: Map<number, Bytes> }>();
  for (const s of segments) {
    if (s.marker === APP1 && startsWith(s.data, XMP_HEADER) && xmp === null) {
      xmp = s.data.subarray(XMP_HEADER.length);
    }
    if (s.marker === APP11 && startsWith(s.data, JP) && s.data.length >= APP11_HEADER) {
      const en = readU16(s.data, 2);
      const z = readU32(s.data, 4);
      const entry = instances.get(en) ?? { header: s.data.subarray(8, 16), parts: new Map() };
      entry.parts.set(z, s.data.subarray(APP11_HEADER));
      instances.set(en, entry);
    }
  }
  const superboxes: Bytes[] = [];
  for (const { header, parts } of instances.values()) {
    const ordered: Bytes[] = [];
    for (let z = 1; z <= parts.size; z++) {
      const part = parts.get(z);
      if (part !== undefined) ordered.push(part);
    }
    const body = concat(ordered);
    // LBox は superbox 全体の長さ。外部ツールが一部のセグメントだけ残した場合はここで不一致になるので、
    // その superbox だけを捨てる（他の superbox や XMP は読める）
    if (ordered.length === parts.size && readU32(header, 0) === body.length + 8) {
      superboxes.push(concat([header, body]));
    }
  }
  return { xmp, superboxes };
}

/** SOFn セグメントから画像の大きさを読む。DHT(C4)・JPG(C8)・DAC(CC) は SOF ではない。 */
export function jpegSize(jpeg: Bytes): { width: number; height: number } {
  for (const s of scan(jpeg).segments) {
    const m = s.marker & 0xff;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (s.data.length < 5) break;
      return { height: readU16(s.data, 1), width: readU16(s.data, 3) };
    }
  }
  throw new RangeError("SOF not found");
}

/** JFIF（APP0）の密度から解像度（dpi）を読む。単位がない（縦横比だけ）・縦横で違う・ないときは null */
export function jpegDpi(jpeg: Bytes): number | null {
  const app0 = scan(jpeg).segments.find((s) => s.marker === APP0 && startsWith(s.data, JFIF));
  if (app0 === undefined || app0.data.length < 12) return null;
  const unit = app0.data[7];
  const x = readU16(app0.data, 8);
  if (x === 0 || x !== readU16(app0.data, 10)) return null;
  return unit === 1 ? x : unit === 2 ? x * 2.54 : null;
}
