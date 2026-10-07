import { readFileSync } from "node:fs";
import { type AnoiDocument, applyOps, createDocument } from "@anoi/model";

const dir = new URL("../../fixtures/", import.meta.url);

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(name, dir)));
}

export const DOC_ID = "c8be77cd-bc6d-4747-bf15-12e345a4b522";

export function sampleDoc(): AnoiDocument {
  const doc = createDocument({
    width: 64,
    height: 40,
    docId: DOC_ID,
    title: "通知設定",
    now: new Date("2026-10-07T08:00:00Z"),
  });
  const r = applyOps(doc, [
    {
      op: "add",
      annotation: {
        id: "a1",
        type: "rect",
        x: 8,
        y: 8,
        w: 32,
        h: 22,
        style: { stroke: "#e5484d", strokeWidth: 3 },
      },
    },
    { op: "add", annotation: { id: "t1", type: "text", x: 42, y: 10, text: "保存ボタン" } },
  ]);
  if (!r.ok) throw new Error(r.error.message);
  return { ...r.value, revision: 1 };
}

/** JPEG の SOS 直前にセグメントを差し込む（外部ツールが付けたメタデータの再現用）。 */
export function insertJpegSegment(jpeg: Uint8Array, marker: number, data: Uint8Array): Uint8Array {
  const seg = new Uint8Array(4 + data.length);
  seg.set([0xff, marker & 0xff, ((data.length + 2) >> 8) & 0xff, (data.length + 2) & 0xff]);
  seg.set(data, 4);
  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, 2));
  out.set(seg, 2);
  out.set(jpeg.subarray(2), 2 + seg.length);
  return out;
}

export function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

export function lastIndexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = haystack.length - needle.length; i >= 0; i--) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
