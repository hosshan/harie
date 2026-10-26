// ポップアップ。押したボタンの方法で、今のタブをキャプチャする（ボタンを押したことで activeTab が付く）
import { applyDocumentLang, getLocale } from "@harie/editor/locale";
import { browser } from "wxt/browser";
import { extensionMessages } from "@/lib/messages";
import { ALL_SITES_ORIGINS, GITHUB_ORIGINS } from "@/lib/page-image";

// 言語はエディタの設定と同じ（拡張のページどうしは localStorage を共有する）
const locale = getLocale();
const m = extensionMessages(locale);
applyDocumentLang(locale);
document.title = m.popupTitle;
for (const el of document.querySelectorAll<HTMLElement>("[data-message]")) {
  const key = el.dataset.message as
    | "popupTitle"
    | "visible"
    | "region"
    | "element"
    | "popupNote"
    | "pageTitle"
    | "pageGithub"
    | "pageAllSites"
    | "pageNote";
  el.textContent = m[key];
}

const alert = document.querySelector<HTMLElement>("[role=alert]");

for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-mode]")) {
  button.addEventListener("click", async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    const result = (await browser.runtime.sendMessage({
      type: "harie:start",
      mode: button.dataset.mode,
      tabId: tab.id,
      locale,
    })) as { ok: boolean; message?: string };
    if (result.ok) {
      window.close();
    } else if (alert !== null) {
      alert.textContent = result.message ?? m.failed;
      alert.hidden = false;
    }
  });
}

// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。オンにしたときだけサイトの権限を求める。
// 権限が変わると background がページ用のスクリプトを登録し直す
const PAGE_ORIGINS = { github: GITHUB_ORIGINS, all: ALL_SITES_ORIGINS };
const pageBoxes = [...document.querySelectorAll<HTMLInputElement>("input[data-page]")];

async function refreshPageBoxes(): Promise<void> {
  for (const box of pageBoxes) {
    const origins = PAGE_ORIGINS[box.dataset.page as keyof typeof PAGE_ORIGINS];
    box.checked = await browser.permissions.contains({ origins });
  }
}

for (const box of pageBoxes) {
  box.addEventListener("change", async () => {
    const origins = PAGE_ORIGINS[box.dataset.page as keyof typeof PAGE_ORIGINS];
    try {
      if (box.checked) await browser.permissions.request({ origins });
      else await browser.permissions.remove({ origins });
    } finally {
      await refreshPageBoxes();
    }
  });
}
void refreshPageBoxes();
