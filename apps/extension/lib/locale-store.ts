// 表示言語を拡張全体で揃える（NFR-I18N-01）。拡張のページ（ポップアップ・設定・エディタ）は localStorage（`harie.locale`）を
// 共有するが、service worker とページに注入するスクリプトは読めないので、chrome.storage.local にも写しておく
import { isLocale, type Locale, loadStoredLocale } from "@harie/editor/locale";
import { browser } from "wxt/browser";

const KEY = "harie.locale";

/** 選ばれた言語。選ばれていない・読めないときは null（ブラウザの言語に従う） */
export async function loadExtensionLocale(): Promise<Locale | null> {
  try {
    const got = await browser.storage.local.get(KEY);
    return isLocale(got[KEY]) ? got[KEY] : null;
  } catch {
    return null;
  }
}

export async function saveExtensionLocale(locale: Locale): Promise<void> {
  await browser.storage.local.set({ [KEY]: locale });
}

/** 拡張のページで選ばれている言語（localStorage）を、service worker・ページ用スクリプトにも見えるようにする */
export async function shareStoredLocale(): Promise<void> {
  const stored = loadStoredLocale();
  if (stored !== null && (await loadExtensionLocale()) !== stored)
    await saveExtensionLocale(stored);
}
