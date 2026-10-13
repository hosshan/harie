// 保存（FR-FILE-06）。描き直した画像に注釈データを埋め込み、ファイル名規則で書き出す
import { type ImageFormat, writeHarie } from "@harie/format";
import { type HarieDocument, prepareForSave, renameForSave } from "@harie/model";
import { browserRenderer } from "./browser-renderer";
import type { Opened } from "./load";

export type Saved = {
  fileName: string;
  bytes: Uint8Array;
  doc: HarieDocument;
  format: ImageFormat;
};

/**
 * 保存形式（FR-FILE-01, 02）は利用者が選べる。既定は開いたファイルの形式。
 * 形式を変えても埋め込むベース画像は読み込んだバイト列のまま（ADR-0004）で、描いた画像だけが選んだ形式になる
 */
export async function buildSaveFile(
  opened: Opened,
  doc: HarieDocument,
  output: ImageFormat = opened.format,
): Promise<Saved> {
  const saved = prepareForSave(doc);
  const rendered = await (await browserRenderer()).render({
    doc: saved,
    base: opened.base,
    output,
  });
  const bytes = writeHarie({ rendered, base: opened.base.bytes, doc: saved });
  const fileName = renameForSave(opened.fileName, output === "png" ? "png" : "jpg");
  return { fileName, bytes, doc: saved, format: output };
}

/** File System Access API のハンドルがあれば上書き、なければダウンロードする */
export async function deliver(saved: Saved, handle: FileSystemFileHandle | null): Promise<void> {
  const blob = new Blob([saved.bytes as Uint8Array<ArrayBuffer>], {
    type: saved.format === "png" ? "image/png" : "image/jpeg",
  });
  if (handle !== null) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = saved.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
