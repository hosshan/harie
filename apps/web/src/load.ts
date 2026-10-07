// 開いたファイルを、エディタで扱える状態にする（FR-FILE-05, FR-FILE-08）
import { type BaseMediaType, type MismatchReason, readAnoi, readImageSize } from "@anoi/format";
import { type AnoiDocument, createDocument } from "@anoi/model";

export type Opened = {
  fileName: string;
  doc: AnoiDocument;
  base: { bytes: Uint8Array; mediaType: BaseMediaType };
  /** 元から Anoi ファイルだったか（上書き保存してよいかの判断に使う） */
  wasAnoi: boolean;
  /** 不整合だったが、埋め込みの注釈とベース画像から開けた場合の理由 */
  warning?: MismatchReason;
};

export type LoadResult = { ok: true; opened: Opened } | { ok: false; message: string };

const MISMATCH_MESSAGES: Record<MismatchReason, string> = {
  PayloadMissing: "注釈データの一部が失われています。画像だけを開きました。",
  PayloadCorrupted: "注釈データが壊れています。画像だけを開きました。",
  RenderedImageModified:
    "画像が別のアプリで編集されています。保存されていた注釈と元の画像から開き直しました（別のアプリでの変更は反映されていません）。",
  UnsupportedVersion: "新しいバージョンの Anoi で保存されたファイルです。画像だけを開きました。",
  InvalidDocument: "注釈データを読めません。画像だけを開きました。",
};

export function mismatchMessage(reason: MismatchReason): string {
  return MISMATCH_MESSAGES[reason];
}

export function loadFile(fileName: string, bytes: Uint8Array, now = new Date()): LoadResult {
  const read = readAnoi(bytes);
  switch (read.kind) {
    case "anoi":
      return { ok: true, opened: { fileName, doc: read.doc, base: read.base, wasAnoi: true } };
    case "anoi-mismatch":
      if (read.doc !== undefined && read.base !== undefined) {
        return {
          ok: true,
          opened: { fileName, doc: read.doc, base: read.base, wasAnoi: true, warning: read.reason },
        };
      }
      return plain(fileName, bytes, read.format, now, read.reason);
    case "plain":
      return plain(fileName, bytes, read.format, now);
    case "unsupported":
      return { ok: false, message: "JPEG か PNG の画像を開いてください。" };
    case "corrupted":
      return { ok: false, message: "画像が壊れているため開けません。" };
  }
}

function plain(
  fileName: string,
  bytes: Uint8Array,
  format: "jpeg" | "png",
  now: Date,
  warning?: MismatchReason,
): LoadResult {
  const size = readImageSize(bytes);
  if (size === null) return { ok: false, message: "画像の大きさを読めません。" };
  return {
    ok: true,
    opened: {
      fileName,
      doc: createDocument({ ...size, now }),
      base: { bytes, mediaType: format === "png" ? "image/png" : "image/jpeg" },
      wasAnoi: false,
      ...(warning === undefined ? {} : { warning }),
    },
  };
}
