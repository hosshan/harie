// 開いたファイルを、エディタで扱える状態にする（FR-FILE-05, FR-FILE-08）
import { type BaseMediaType, type MismatchReason, readHarie, readImageSize } from "@harie/format";
import { createDocument, type HarieDocument } from "@harie/model";

export type Opened = {
  fileName: string;
  doc: HarieDocument;
  base: { bytes: Uint8Array; mediaType: BaseMediaType };
  /** 元から Harie ファイルだったか（上書き保存してよいかの判断に使う） */
  wasHarie: boolean;
  /** 不整合だった理由。注釈を復元できたときも、画像だけを開いたときも入る */
  warning?: MismatchReason;
  /**
   * 画像が外部で編集されていた（RenderedImageModified）ときの、もう一つの開き方:
   * 今の画像を新しいベース画像にする（保存されていた注釈は使わない）。architecture 3.2
   */
  alternative?: Opened;
};

export type LoadResult = { ok: true; opened: Opened } | { ok: false; message: string };

const MISMATCH_MESSAGES: Record<MismatchReason, string> = {
  PayloadMissing: "注釈データの一部が失われています。画像だけを開きました。",
  PayloadCorrupted: "注釈データが壊れています。画像だけを開きました。",
  RenderedImageModified:
    "画像が別のアプリで編集されています。保存されていた注釈と元の画像で開きました（別のアプリでの変更は反映されていません）。",
  UnsupportedVersion: "新しいバージョンの Harie で保存されたファイルです。画像だけを開きました。",
  InvalidDocument: "注釈データを読めません。画像だけを開きました。",
};

export function mismatchMessage(reason: MismatchReason): string {
  return MISMATCH_MESSAGES[reason];
}

export function loadFile(fileName: string, bytes: Uint8Array, now = new Date()): LoadResult {
  const read = readHarie(bytes);
  switch (read.kind) {
    case "harie":
      return { ok: true, opened: { fileName, doc: read.doc, base: read.base, wasHarie: true } };
    case "harie-mismatch":
      if (read.doc !== undefined && read.base !== undefined) {
        const current = plain(fileName, bytes, read.format, now);
        return {
          ok: true,
          opened: {
            fileName,
            doc: read.doc,
            base: read.base,
            wasHarie: true,
            warning: read.reason,
            // 今の画像を下地にしても Harie ファイルなので、開いたファイルへの上書きでよい
            ...(current.ok ? { alternative: { ...current.opened, wasHarie: true } } : {}),
          },
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
      wasHarie: false,
      ...(warning === undefined ? {} : { warning }),
    },
  };
}
