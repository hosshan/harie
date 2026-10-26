// ページ上の Harie 画像を読む（service worker で動く。FR-FILE-12, FR-FILE-13）。
// 画像は利用者が許可したサイトの分だけ、拡張の権限で取りに行く（ページの CORS の制限を受けない）
import { readHarie } from "@harie/format";
import type { HarieDocument } from "@harie/model";
import { browser } from "wxt/browser";
import { z } from "zod";
import { putCapture } from "./capture-store";
import { fileNameFromUrl, isGitHubImageRequest, isHttpUrl, pageScriptMatches } from "./page-image";

/** これより大きい画像は読まない */
const MAX_BYTES = 40 * 1024 * 1024;
const PAGE_SCRIPT_ID = "harie-page";

/** ページ用のスクリプトから来るメッセージ。ページの影響を受けうるので、形を確かめてから使う */
export const PageMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("harie:page-probe"), url: z.string().max(8192) }),
  z.object({ type: z.literal("harie:page-annotations"), url: z.string().max(8192) }),
  z.object({ type: z.literal("harie:page-edit"), url: z.string().max(8192) }),
]);
export type PageMessage = z.infer<typeof PageMessageSchema>;

export type AnnotationsResponse =
  | { ok: true; doc: HarieDocument; mismatch: boolean }
  | { ok: false; reason: "not-harie" | "failed" };

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

/** 同じ画像を何度も読まないよう、判定の結果だけを覚えておく */
const probed = new Map<string, boolean>();

async function probe(url: string): Promise<boolean> {
  const known = probed.get(url);
  if (known !== undefined) return known;
  let harie = false;
  try {
    const kind = readHarie(await fetchImage(url)).kind;
    harie = kind === "harie" || kind === "harie-mismatch";
  } catch {
    harie = false;
  }
  if (probed.size > 500) probed.clear();
  probed.set(url, harie);
  return harie;
}

async function annotations(url: string): Promise<AnnotationsResponse> {
  try {
    const read = readHarie(await fetchImage(url));
    if (read.kind === "harie") return { ok: true, doc: read.doc, mismatch: false };
    if (read.kind === "harie-mismatch" && read.doc !== undefined) {
      return { ok: true, doc: read.doc, mismatch: true };
    }
    return { ok: false, reason: "not-harie" };
  } catch {
    return { ok: false, reason: "failed" };
  }
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
  sender: { url?: string | undefined; tab?: { index?: number } | undefined },
): Promise<unknown> {
  switch (message.type) {
    case "harie:page-probe":
      // ページには Harie 画像かどうかだけを返す（中身は返さない）
      return { harie: await probe(message.url) };
    case "harie:page-annotations":
      // 中身（注釈データ）を返すのは GitHub のページで GitHub の画像を読むときだけ。
      // ほかのサイトで、ログインが要る別サイトの画像の中身をページに渡さないため
      if (!isGitHubImageRequest(sender.url, message.url)) return { ok: false, reason: "failed" };
      return annotations(message.url);
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
