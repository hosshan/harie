// JUMBF（ISO/IEC 19566-5）の最小実装。Anoi が使う JSON ボックスと埋め込みファイルボックスのみ
import {
  ascii,
  type Bytes,
  concat,
  fromAscii,
  fromUtf8,
  hexToBytes,
  readU32,
  toHex,
  u32,
  utf8,
} from "./bytes";

export const JSON_TYPE_UUID = "6a736f6e00110010800000aa00389b71";
export const EMBEDDED_FILE_TYPE_UUID = "40cb0c32bb8a489da70b2ad6f47f4369";

export function box(type: string, payload: Bytes): Bytes {
  return concat([u32(8 + payload.length), ascii(type), payload]);
}

function jumd(typeUuid: string, label: string): Bytes {
  // toggles 0x03 = requestable + label present
  return box("jumd", concat([hexToBytes(typeUuid), Uint8Array.of(0x03), utf8(`${label}\0`)]));
}

export function jsonSuperbox(label: string, json: string): Bytes {
  return box("jumb", concat([jumd(JSON_TYPE_UUID, label), box("json", utf8(json))]));
}

export function fileSuperbox(label: string, mediaType: string, data: Bytes): Bytes {
  const bfdb = box("bfdb", concat([Uint8Array.of(0x00), utf8(`${mediaType}\0`)]));
  return box("jumb", concat([jumd(EMBEDDED_FILE_TYPE_UUID, label), bfdb, box("bidb", data)]));
}

type RawBox = { type: string; data: Bytes };

function children(body: Bytes): RawBox[] {
  const out: RawBox[] = [];
  let p = 0;
  while (p < body.length) {
    const len = readU32(body, p);
    if (len < 8 || p + len > body.length) throw new RangeError("invalid box length");
    out.push({ type: fromAscii(body.subarray(p + 4, p + 8)), data: body.subarray(p + 8, p + len) });
    p += len;
  }
  return out;
}

export type ParsedSuperbox =
  | { label: string; kind: "json"; json: string }
  | { label: string; kind: "file"; mediaType: string; data: Bytes }
  | { label: string; kind: "other" };

/** `jumb` superbox（LBox/TBox を含む完全なバイト列）を解析する。 */
export function parseSuperbox(superbox: Bytes): ParsedSuperbox {
  const [top] = children(superbox);
  if (top === undefined || top.type !== "jumb") throw new RangeError("not a jumb box");
  const [desc, ...content] = children(top.data);
  if (desc === undefined || desc.type !== "jumd") throw new RangeError("missing jumd");
  const typeUuid = toHex(desc.data.subarray(0, 16));
  const toggles = desc.data[16] ?? 0;
  const labelBytes = desc.data.subarray(17);
  const end = labelBytes.indexOf(0);
  const label = toggles & 0x02 ? fromUtf8(labelBytes.subarray(0, end < 0 ? undefined : end)) : "";

  if (typeUuid === JSON_TYPE_UUID) {
    const json = content.find((c) => c.type === "json");
    if (json) return { label, kind: "json", json: fromUtf8(json.data) };
  }
  if (typeUuid === EMBEDDED_FILE_TYPE_UUID) {
    const bfdb = content.find((c) => c.type === "bfdb");
    const bidb = content.find((c) => c.type === "bidb");
    if (bfdb && bidb) {
      const mt = bfdb.data.subarray(1);
      const z = mt.indexOf(0);
      return {
        label,
        kind: "file",
        mediaType: fromUtf8(mt.subarray(0, z < 0 ? undefined : z)),
        data: bidb.data,
      };
    }
  }
  return { label, kind: "other" };
}
