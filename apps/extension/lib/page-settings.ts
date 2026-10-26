// ページ上の Harie 画像のボタンの設定（FR-FILE-12, FR-FILE-13）。ポップアップで変え、
// background（スクリプトを入れるサイト）とページ用スクリプト（出すボタン）が読む。chrome.storage.local に置く
import { browser } from "wxt/browser";
import { normalizeSite } from "./page-image";

export type PageSettings = {
  /** 画像に編集ボタンを出す（FR-FILE-13） */
  edit: boolean;
  /** 画像に説明文のコピーボタンを出す（FR-FILE-12） */
  copy: boolean;
  /** ボタンを出すサイト（ドメイン）。空ならすべてのサイト */
  sites: string[];
};

const KEY = "harie.pageButtons";
export const DEFAULT_PAGE_SETTINGS: PageSettings = { edit: false, copy: false, sites: [] };
/** 登録できるサイトの数の上限 */
export const MAX_SITES = 50;

/** 保存された値は形を確かめ、足りない項目は既定にする */
export function parsePageSettings(raw: unknown): PageSettings {
  const v = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const sites = Array.isArray(v.sites)
    ? v.sites.flatMap((x) => (typeof x === "string" ? (normalizeSite(x) ?? []) : []))
    : [];
  return {
    edit: v.edit === true,
    copy: v.copy === true,
    sites: [...new Set(sites)].slice(0, MAX_SITES),
  };
}

export async function loadPageSettings(): Promise<PageSettings> {
  const got = await browser.storage.local.get(KEY);
  return parsePageSettings(got[KEY]);
}

export function savePageSettings(settings: PageSettings): Promise<void> {
  return browser.storage.local.set({ [KEY]: settings });
}

export function onPageSettingsChanged(listener: (settings: PageSettings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && KEY in changes) listener(parsePageSettings(changes[KEY]?.newValue));
  });
}
