// キャプチャを拡張の中の IndexedDB に置き、エディタページに渡す。
// 画像は数 MB になり chrome.storage.session の上限に近いので、Blob のまま IndexedDB に入れる
import type { DomSnapshot } from "@harie/ai";

export type CaptureRecord = {
  id: string;
  fileName: string;
  image: Blob;
  /** キャプチャ時の DOM 情報。AI にだけ使い、保存ファイルには入れない */
  dom: DomSnapshot | null;
  createdAt: number;
};

const DB = "harie";
const STORE = "captures";
/** これより古いキャプチャは、次のキャプチャのときに消す */
const KEEP_MS = 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function putCapture(record: CaptureRecord): Promise<void> {
  const all = await run<CaptureRecord[]>("readonly", (s) => s.getAll());
  for (const old of all) {
    if (record.createdAt - old.createdAt > KEEP_MS) await run("readwrite", (s) => s.delete(old.id));
  }
  await run("readwrite", (s) => s.put(record));
}

export function getCapture(id: string): Promise<CaptureRecord | undefined> {
  return run<CaptureRecord | undefined>("readonly", (s) => s.get(id));
}
