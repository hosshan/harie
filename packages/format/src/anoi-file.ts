// Anoi ファイルの読み書き（docs/03-design/anoi-format-spec.md, ADR-0004）
import { type AnoiDocument, DocumentSchema, migrateDocument } from "@anoi/model";
import { sha256 } from "@noble/hashes/sha2.js";
import { type Bytes, concat, fromUtf8, toHex, utf8 } from "./bytes";
import { embedJpeg, extractJpeg, isJpeg, jpegRenderData } from "./jpeg";
import { fileSuperbox, jsonSuperbox, parseSuperbox } from "./jumbf";
import { embedPng, extractPng, isPng, pngRenderData } from "./png";
import { buildXmp, type Descriptor, parseXmp } from "./xmp";

export const FORMAT_VERSION = "0.1";
export const DOCUMENT_LABEL = "anoi.document";
export const BASE_LABEL = "anoi.base";
/** C2PA マニフェストと衝突しないよう、JPEG の Box Instance 番号は 0xA001 から使う。 */
const FIRST_JPEG_INSTANCE = 0xa001;

export type ImageFormat = "jpeg" | "png";
export type BaseMediaType = "image/jpeg" | "image/png";

export function detectFormat(bytes: Bytes): ImageFormat | null {
  if (isJpeg(bytes)) return "jpeg";
  if (isPng(bytes)) return "png";
  return null;
}

const MEDIA_TYPES: Record<ImageFormat, BaseMediaType> = {
  jpeg: "image/jpeg",
  png: "image/png",
};

function renderData(bytes: Bytes, format: ImageFormat): Bytes {
  return format === "jpeg" ? jpegRenderData(bytes) : pngRenderData(bytes);
}

const hex = (b: Bytes) => toHex(sha256(b));

/**
 * レンダリング画像に注釈ドキュメントとベース画像を埋め込む。
 * ベース画像は渡されたバイト列をそのまま格納し、再エンコードしない（FR-FILE-04）。
 */
export function writeAnoi(input: { rendered: Bytes; base: Bytes; doc: AnoiDocument }): Bytes {
  const format = detectFormat(input.rendered);
  if (format === null) throw new Error("rendered は JPEG または PNG であること");
  const baseFormat = detectFormat(input.base);
  if (baseFormat === null) throw new Error("base は JPEG または PNG であること");
  const doc = DocumentSchema.parse(input.doc);

  const docBox = jsonSuperbox(DOCUMENT_LABEL, JSON.stringify(doc));
  const baseBox = fileSuperbox(BASE_LABEL, MEDIA_TYPES[baseFormat], input.base);
  const descriptor: Descriptor = {
    formatVersion: FORMAT_VERSION,
    docId: doc.docId,
    revision: doc.revision,
    payloadSha256: hex(concat([docBox, baseBox])),
    renderSha256: hex(renderData(input.rendered, format)),
  };
  const xmp = utf8(buildXmp(descriptor));
  return format === "jpeg"
    ? embedJpeg(input.rendered, xmp, [docBox, baseBox], FIRST_JPEG_INSTANCE)
    : embedPng(input.rendered, xmp, [docBox, baseBox]);
}

export type MismatchReason =
  | "PayloadMissing"
  | "PayloadCorrupted"
  | "RenderedImageModified"
  | "UnsupportedVersion"
  | "InvalidDocument";

export type ReadResult =
  | { kind: "plain"; format: ImageFormat }
  | {
      kind: "anoi";
      format: ImageFormat;
      descriptor: Descriptor;
      doc: AnoiDocument;
      base: { bytes: Bytes; mediaType: BaseMediaType };
    }
  | {
      kind: "anoi-mismatch";
      format: ImageFormat;
      reason: MismatchReason;
      descriptor: Descriptor;
      /** 復元できた場合のみ。RenderedImageModified ではユーザーに選ばせる材料になる。 */
      doc?: AnoiDocument;
      base?: { bytes: Bytes; mediaType: BaseMediaType };
    }
  | { kind: "unsupported" }
  | { kind: "corrupted"; format: ImageFormat; message: string };

function isBaseMediaType(s: string): s is BaseMediaType {
  return s === "image/jpeg" || s === "image/png";
}

/**
 * ファイルを読む。どんな入力でも例外を投げず、状態付きの結果を返す（NFR-DATA-03）。
 * 読み込み手順は形式仕様 §6。
 */
export function readAnoi(bytes: Bytes): ReadResult {
  const format = detectFormat(bytes);
  if (format === null) return { kind: "unsupported" };

  let extracted: { xmp: Bytes | null; superboxes: Bytes[] };
  try {
    extracted = format === "jpeg" ? extractJpeg(bytes) : extractPng(bytes);
  } catch (e) {
    return { kind: "corrupted", format, message: e instanceof Error ? e.message : String(e) };
  }

  let descriptor: Descriptor | null = null;
  try {
    descriptor = extracted.xmp ? parseXmp(fromUtf8(extracted.xmp)) : null;
  } catch {
    descriptor = null;
  }
  if (descriptor === null) return { kind: "plain", format };
  const mismatch = (reason: MismatchReason, extra: object = {}): ReadResult => ({
    kind: "anoi-mismatch",
    format,
    reason,
    descriptor: descriptor as Descriptor,
    ...extra,
  });

  if (descriptor.formatVersion.split(".")[0] !== FORMAT_VERSION.split(".")[0]) {
    return mismatch("UnsupportedVersion");
  }

  let docBox: Bytes | undefined;
  let baseBox: Bytes | undefined;
  let docJson: string | undefined;
  let base: { bytes: Bytes; mediaType: BaseMediaType } | undefined;
  for (const sb of extracted.superboxes) {
    try {
      const parsed = parseSuperbox(sb);
      if (parsed.label === DOCUMENT_LABEL && parsed.kind === "json") {
        docBox = sb;
        docJson = parsed.json;
      } else if (
        parsed.label === BASE_LABEL &&
        parsed.kind === "file" &&
        isBaseMediaType(parsed.mediaType)
      ) {
        baseBox = sb;
        base = { bytes: parsed.data, mediaType: parsed.mediaType };
      }
    } catch {
      // 知らない・壊れた superbox は無視する（C2PA 等の他者のデータもありうる）
    }
  }
  if (docBox === undefined || baseBox === undefined || docJson === undefined || !base) {
    return mismatch("PayloadMissing");
  }
  if (hex(concat([docBox, baseBox])) !== descriptor.payloadSha256) {
    return mismatch("PayloadCorrupted");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(docJson);
  } catch {
    return mismatch("InvalidDocument");
  }
  const migrated = migrateDocument(raw);
  if (!migrated.ok) {
    return mismatch(
      migrated.error.kind === "UnsupportedVersion" ? "UnsupportedVersion" : "InvalidDocument",
    );
  }
  const doc = migrated.value;

  let renderMatches = false;
  try {
    renderMatches = hex(renderData(bytes, format)) === descriptor.renderSha256;
  } catch {
    renderMatches = false;
  }
  if (!renderMatches) return mismatch("RenderedImageModified", { doc, base });

  return { kind: "anoi", format, descriptor, doc, base };
}
