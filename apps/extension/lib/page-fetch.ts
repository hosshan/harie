// ページ上の Harie 画像を読む（service worker で動く。FR-FILE-12, FR-FILE-13）。
// 画像は利用者が許可したサイトの分だけ、拡張の権限で取りに行く（ページの CORS の制限を受けない）
import { readHarie } from "@harie/format";
import { browser } from "wxt/browser";
import { z } from "zod";
import { putCapture } from "./capture-store";
import { type PageImageInfo, pageImageInfo } from "./page-copy";
import { fileNameFromUrl, isHttpUrl, pageScriptMatches } from "./page-image";

/** これより大きい画像は読まない */
const MAX_BYTES = 40 * 1024 * 1024;
const PAGE_SCRIPT_ID = "harie-page";

/** ページ用のスクリプトから来るメッセージ。ページの影響を受けうるので、形を確かめてから使う */
export const PageMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("harie:page-read"), url: z.string().max(8192) }),
  z.object({ type: z.literal("harie:page-edit"), url: z.string().max(8192) }),
]);
export type PageMessage = z.infer<typeof PageMessageSchema>;

async function fetchImage(url: string): Promise<Uint8Array> {
  if (!isHttpUrl(url)) throw new Error("http(s) の画像だけを読めます");
  // ログインが要るページ（非公開リポジトリなど）の画像も読めるよう、cookie を付ける
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const length = Number(res.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) throw new Error("画像が大きすぎます");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("画像が大きすぎます");
  return bytes;
}

/** 同じ画像を何度も読まないよう、結果を覚えておく */
const known = new Map<string, PageImageInfo>();

async function read(url: string): Promise<PageImageInfo> {
  const cached = known.get(url);
  if (cached !== undefined) return cached;
  let info: PageImageInfo = { harie: false };
  try {
    const r = readHarie(await fetchImage(url));
    // 画像が外で編集されていても、注釈データが読めれば説明文はコピーできる
    if (r.kind === "harie") info = pageImageInfo(r.doc);
    else if (r.kind === "harie-mismatch") {
      info = r.doc === undefined ? { harie: true, targets: [], all: "" } : pageImageInfo(r.doc);
    }
  } catch {
    info = { harie: false };
  }
  if (known.size > 200) known.clear();
  known.set(url, info);
  return info;
}

/** 画像を取り込み、拡張のエディタで開く。保存はキャプチャと同じくダウンロードになる */
async function edit(url: string, tab: { index?: number } | undefined): Promise<{ ok: boolean }> {
  try {
    const bytes = await fetchImage(url);
    const id = crypto.randomUUID();
    await putCapture({
      id,
      fileName: fileNameFromUrl(url),
      image: new Blob([bytes as Uint8Array<ArrayBuffer>]),
      dom: null,
      createdAt: Date.now(),
    });
    await browser.tabs.create({
      url: browser.runtime.getURL(`/editor.html#${id}`),
      ...(tab?.index === undefined ? {} : { index: tab.index + 1 }),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function handlePageMessage(
  message: PageMessage,
  sender: { tab?: { index?: number } | undefined },
): Promise<unknown> {
  switch (message.type) {
    case "harie:page-read":
      // 説明文は content script（ページの JS からは見えない隔離された環境）にだけ渡す。
      // content script はそれを DOM に書かない（閉じた Shadow DOM のボタンからクリップボードに書くだけ）
      return read(message.url);
    case "harie:page-edit":
      return edit(message.url, sender.tab);
  }
}

/** 許可されているサイトに合わせて、ページ用のスクリプトを登録し直す。権限が変わったとき・起動したときに呼ぶ */
let syncing: Promise<void> = Promise.resolve();
export function syncPageScripts(): Promise<void> {
  syncing = syncing.then(async () => {
    try {
      const { origins = [] } = await browser.permissions.getAll();
      const matches = pageScriptMatches(origins);
      const registered = await browser.scripting.getRegisteredContentScripts({
        ids: [PAGE_SCRIPT_ID],
      });
      if (registered.length > 0) {
        await browser.scripting.unregisterContentScripts({ ids: [PAGE_SCRIPT_ID] });
      }
      if (matches.length === 0) return;
      await browser.scripting.registerContentScripts([
        {
          id: PAGE_SCRIPT_ID,
          js: ["/page.js"],
          matches,
          // GitHub の差分の画像は別ドメインの iframe の中に出る
          allFrames: true,
          runAt: "document_idle",
          persistAcrossSessions: true,
        },
      ]);
    } catch (e) {
      console.error("ページ用のスクリプトを登録できませんでした", e);
    }
  });
  return syncing;
}
