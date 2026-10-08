#!/usr/bin/env node
// Harie JPEG 埋め込み方式の PoC（docs/research/image-storage.md 参照）
//
// 使い方:
//   node harie-jpeg-poc.mjs write <rendered.jpg> <base.jpg> <out.jpg>
//   node harie-jpeg-poc.mjs read  <harie.jpg> [<extracted-base.jpg>]
//
// 方式:
//   - APP1 XMP に小さな記述子（docId / formatVersion / payload の SHA-256）
//   - APP11 JUMBF（ISO/IEC 19566-5, C2PA と同じ入れ物）に
//       label "harie.document" : JSON（アノテーション文書）
//       label "harie.base"     : 元画像バイナリ（再編集用、アノテーション焼き込み前）
//     64KB を超える box は複数 APP11 セグメントに分割（Z = シーケンス番号）
// 依存なし（Node 標準のみ）。実装本体ではなく検証用コード。

import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";

const SOI = 0xffd8;
const APP1 = 0xffe1;
const APP11 = 0xffeb;
const SOS = 0xffda;
const MAX_SEG_DATA = 0xffff - 2; // 長さフィールド自身を除いたセグメント本体の上限

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };

function box(type, payload) {
  return Buffer.concat([u32(8 + payload.length), Buffer.from(type, "ascii"), payload]);
}

// JUMBF 記述ボックス: type UUID(16) + toggles(1) + label(null 終端)
function jumd(typeUuidHex, label) {
  return box("jumd", Buffer.concat([
    Buffer.from(typeUuidHex, "hex"),
    Buffer.from([0x03]), // requestable + label present
    Buffer.from(label + "\0", "utf8"),
  ]));
}

// ISO/IEC 19566-5 のコンテンツ種別 UUID（json / embedded file）
const JSON_TYPE = "6a736f6e00110010800000aa00389b71";
const EMBEDDED_FILE_TYPE = "40cb0c32bb8a489da70b2ad6f47f4369";

function jumbJson(label, obj) {
  return box("jumb", Buffer.concat([
    jumd(JSON_TYPE, label),
    box("json", Buffer.from(JSON.stringify(obj), "utf8")),
  ]));
}

function jumbFile(label, mediaType, bytes) {
  const bfdb = box("bfdb", Buffer.concat([Buffer.from([0x00]), Buffer.from(mediaType + "\0", "utf8")]));
  return box("jumb", Buffer.concat([jumd(EMBEDDED_FILE_TYPE, label), bfdb, box("bidb", bytes)]));
}

// 1 つの JUMBF superbox を APP11 セグメント列に分割する（C2PA と同じ規則）
function toApp11Segments(superbox, instance) {
  const lboxTbox = superbox.subarray(0, 8);
  const body = superbox.subarray(8);
  const segs = [];
  let offset = 0;
  let seq = 1;
  const headerLen = 2 /*CI*/ + 2 /*En*/ + 4 /*Z*/ + 8 /*LBox+TBox*/;
  const chunk = MAX_SEG_DATA - headerLen;
  while (offset < body.length) {
    const part = body.subarray(offset, offset + chunk);
    const data = Buffer.concat([Buffer.from("JP"), u16(instance), u32(seq), lboxTbox, part]);
    segs.push(Buffer.concat([u16(APP11), u16(data.length + 2), data]));
    offset += part.length;
    seq += 1;
  }
  return segs;
}

function xmpSegment(desc) {
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:harie="https://harie.app/ns/1.0/"
 harie:formatVersion="${desc.formatVersion}" harie:docId="${desc.docId}"
 harie:revision="${desc.revision}" harie:payloadSha256="${desc.payloadSha256}"/>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  const data = Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0"), Buffer.from(xmp, "utf8")]);
  return Buffer.concat([u16(APP1), u16(data.length + 2), data]);
}

function* segments(jpeg) {
  if (jpeg.readUInt16BE(0) !== SOI) throw new Error("not a JPEG");
  let p = 2;
  while (p < jpeg.length) {
    const marker = jpeg.readUInt16BE(p);
    if (marker === SOS) { yield { marker, start: p, end: jpeg.length }; return; }
    const len = jpeg.readUInt16BE(p + 2);
    yield { marker, start: p, end: p + 2 + len, data: jpeg.subarray(p + 4, p + 2 + len) };
    p += 2 + len;
  }
}

function write(renderedPath, basePath, outPath) {
  const rendered = readFileSync(renderedPath);
  const base = readFileSync(basePath);
  const doc = {
    $schema: "https://harie.app/schema/document/0.1.json",
    docId: randomUUID(),
    revision: 1,
    service: "example",
    canvas: { width: 1280, height: 800 },
    layers: [{ id: "a1", type: "rect", x: 100, y: 100, w: 500, h: 300, style: { stroke: "#ff0000", strokeWidth: 6 } }],
  };
  const docBox = jumbJson("harie.document", doc);
  const baseBox = jumbFile("harie.base", "image/jpeg", base);
  const payloadSha256 = createHash("sha256").update(docBox).update(baseBox).digest("hex");

  // 既存の APP0/APP1(EXIF) 等は残し、その後ろに XMP と APP11 を差し込む
  const segs = [...segments(rendered)];
  const head = [];
  let rest;
  for (const s of segs) {
    if (s.marker >= 0xffe0 && s.marker <= 0xffef && rest === undefined) head.push(rendered.subarray(s.start, s.end));
    else { rest ??= rendered.subarray(s.start); }
  }
  const out = Buffer.concat([
    u16(SOI), ...head,
    xmpSegment({ formatVersion: "0.1", docId: doc.docId, revision: doc.revision, payloadSha256 }),
    ...toApp11Segments(docBox, 0xa001),
    ...toApp11Segments(baseBox, 0xa002),
    rest,
  ]);
  writeFileSync(outPath, out);
  console.log(JSON.stringify({ out: outPath, renderedBytes: rendered.length, baseBytes: base.length, outBytes: out.length, app11Segments: Math.ceil(baseBox.length / (MAX_SEG_DATA - 16)) + 1 }));
}

function read(path, extractBasePath) {
  const jpeg = readFileSync(path);
  const instances = new Map(); // En -> { header, parts[] }
  let xmp = null;
  for (const s of segments(jpeg)) {
    if (s.marker === APP1 && s.data.subarray(0, 29).toString() === "http://ns.adobe.com/xap/1.0/\0") xmp = s.data.subarray(29).toString("utf8");
    if (s.marker === APP11 && s.data.subarray(0, 2).toString() === "JP") {
      const en = s.data.readUInt16BE(2);
      const z = s.data.readUInt32BE(4);
      const header = s.data.subarray(8, 16);
      const part = s.data.subarray(16);
      if (!instances.has(en)) instances.set(en, { header, parts: [] });
      instances.get(en).parts[z - 1] = part;
    }
  }
  const result = { hasXmpDescriptor: !!xmp && xmp.includes("harie:docId"), boxes: [] };
  for (const [, { header, parts }] of instances) {
    const body = Buffer.concat(parts);
    // body = jumd + content boxes
    let p = 0; const children = [];
    while (p < body.length) { const len = body.readUInt32BE(p); children.push({ type: body.subarray(p + 4, p + 8).toString(), data: body.subarray(p + 8, p + len) }); p += len; }
    const label = children[0].data.subarray(17).toString("utf8").replace(/\0$/, "");
    const content = children.find((c) => c.type === "json" || c.type === "bidb");
    if (content.type === "json") result.boxes.push({ label, json: JSON.parse(content.data.toString("utf8")) });
    else { result.boxes.push({ label, bytes: content.data.length }); if (extractBasePath) writeFileSync(extractBasePath, content.data); }
    void header;
  }
  console.log(JSON.stringify(result, null, 2));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "write") write(...args);
else if (cmd === "read") read(...args);
else { console.error("usage: write <rendered> <base> <out> | read <harie.jpg> [<base-out>]"); process.exit(1); }
