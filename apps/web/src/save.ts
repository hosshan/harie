// 保存（FR-FILE-06）。描き直した画像に注釈データを埋め込み、ファイル名規則で書き出す
import { writeAnoi } from "@anoi/format";
import { type AnoiDocument, prepareForSave, renameForSave } from "@anoi/model";
import { browserRenderer } from "./browser-renderer";
import type { Opened } from "./load";

export type Saved = { fileName: string; bytes: Uint8Array; doc: AnoiDocument };

export async function buildSaveFile(opened: Opened, doc: AnoiDocument): Promise<Saved> {
  const saved = prepareForSave(doc);
  const output = opened.base.mediaType === "image/png" ? "png" : "jpeg";
  const rendered = await (await browserRenderer()).render({
    doc: saved,
    base: opened.base,
    output,
  });
  const bytes = writeAnoi({ rendered, base: opened.base.bytes, doc: saved });
  const fileName = renameForSave(opened.fileName, output === "png" ? "png" : "jpg");
  return { fileName, bytes, doc: saved };
}

/** File System Access API のハンドルがあれば上書き、なければダウンロードする */
export async function deliver(saved: Saved, handle: FileSystemFileHandle | null): Promise<void> {
  const blob = new Blob([saved.bytes as Uint8Array<ArrayBuffer>], {
    type: saved.fileName.endsWith(".png") ? "image/png" : "image/jpeg",
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
