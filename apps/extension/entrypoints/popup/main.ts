// ポップアップ。押したボタンの方法で、今のタブをキャプチャする（ボタンを押したことで activeTab が付く）
import { browser } from "wxt/browser";

const alert = document.querySelector<HTMLElement>("[role=alert]");

for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-mode]")) {
  button.addEventListener("click", async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    const result = (await browser.runtime.sendMessage({
      type: "harie:start",
      mode: button.dataset.mode,
      tabId: tab.id,
    })) as { ok: boolean; message?: string };
    if (result.ok) {
      window.close();
    } else if (alert !== null) {
      alert.textContent = result.message ?? "キャプチャできませんでした";
      alert.hidden = false;
    }
  });
}
