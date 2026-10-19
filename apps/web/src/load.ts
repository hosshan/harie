// 開いたファイルを、エディタで扱える状態にする（FR-FILE-05, FR-FILE-08）
import {
  type BaseMediaType,
  type ImageFormat,
  type MismatchReason,
  readHarie,
  readImageSize,
} from "@harie/format";
import { createDocument, type HarieDocument } from "@harie/model";
import { type WebMessages, webMessages } from "./messages";

export type Opened = {
  fileName: string;
  doc: HarieDocument;
  base: { bytes: Uint8Array; mediaType: BaseMediaType };
  /** 開いたファイルの形式。保存形式の既定にする（ベース画像の形式とは違うことがある） */
  format: ImageFormat;
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

export function mismatchMessage(m: WebMessages, reason: MismatchReason): string {
  return m.load.mismatch[reason];
}

export function loadFile(fileName: string, bytes: Uint8Array, now = new Date()): LoadResult {
  const read = readHarie(bytes);
  switch (read.kind) {
    case "harie":
      return {
        ok: true,
        opened: {
          fileName,
          doc: read.doc,
          base: read.base,
          format: read.format,
          wasHarie: true,
        },
      };
    case "harie-mismatch":
      if (read.doc !== undefined && read.base !== undefined) {
        const current = plain(fileName, bytes, read.format, now);
        return {
          ok: true,
          opened: {
            fileName,
            doc: read.doc,
            base: read.base,
            format: read.format,
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
      return { ok: false, message: webMessages().load.unsupported };
    case "corrupted":
      return { ok: false, message: webMessages().load.corrupted };
  }
}

function plain(
  fileName: string,
  bytes: Uint8Array,
  format: ImageFormat,
  now: Date,
  warning?: MismatchReason,
): LoadResult {
  const size = readImageSize(bytes);
  if (size === null) return { ok: false, message: webMessages().load.noSize };
  return {
    ok: true,
    opened: {
      fileName,
      doc: createDocument({ ...size, now }),
      base: { bytes, mediaType: format === "png" ? "image/png" : "image/jpeg" },
      format,
      wasHarie: false,
      ...(warning === undefined ? {} : { warning }),
    },
  };
}
