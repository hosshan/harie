// ポップアップ。押したボタンの方法で、今のタブをキャプチャする（ボタンを押したことで activeTab が付く）
import { applyDocumentLang, getLocale } from "@harie/editor/locale";
import { browser } from "wxt/browser";
import { extensionMessages } from "@/lib/messages";

// 言語はエディタの設定と同じ（拡張のページどうしは localStorage を共有する）
const locale = getLocale();
const m = extensionMessages(locale);
applyDocumentLang(locale);
document.title = m.popupTitle;
for (const el of document.querySelectorAll<HTMLElement>("[data-message]")) {
  const key = el.dataset.message as "popupTitle" | "visible" | "region" | "element" | "popupNote";
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
