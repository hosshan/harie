// ポップアップ。押した撮り方で今のタブをキャプチャする（ボタンを押したことで activeTab が付く）。
// サイト上の画像ガイドの設定は、ポップアップを簡単にするため設定ページ（entrypoints/options）に置く
import { applyDocumentLang, getLocale } from "@harie/editor/locale";
import { browser } from "wxt/browser";
import { extensionMessages } from "@/lib/messages";

// 言語はエディタの設定と同じ（拡張のページどうしは localStorage を共有する）
const locale = getLocale();
const m = extensionMessages(locale);
applyDocumentLang(locale);
for (const el of document.querySelectorAll<HTMLElement>("[data-message]")) {
  const key = el.dataset.message as
    | "visible"
    | "region"
    | "element"
    | "blank"
    | "settings"
    | "timerLabel"
    | "timerCancel";
  el.textContent = m[key];
}
// 撮り方の説明はツールチップに出す（ポップアップに文を並べない）
const tips = { visible: m.visibleTip, region: m.regionTip, element: m.elementTip };
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-mode]")) {
  button.title = tips[button.dataset.mode as keyof typeof tips];
}

const alert = document.querySelector<HTMLElement>("[role=alert]");

// タイマー（FR-CAP-11）。オンにすると、撮り方のボタンを押してから 5 秒待って撮る。
// 覚えておかない（次に開いたときに知らずに待たされないように）
const timer = document.querySelector<HTMLInputElement>(".timer input") as HTMLInputElement;
timer.closest("label")?.setAttribute("title", m.timerTip);

for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-mode]")) {
  button.addEventListener("click", async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    const result = (await browser.runtime.sendMessage({
      type: "harie:start",
      mode: button.dataset.mode,
      tabId: tab.id,
      timer: timer.checked,
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

// 数えている途中でアイコンを押すと、残りと「やめる」を出す
const pendingBox = document.querySelector(".pending") as HTMLElement;
const pending = (await browser.runtime.sendMessage({ type: "harie:timer-status" })) as {
  left: number;
} | null;
if (pending !== null) {
  (pendingBox.querySelector("span") as HTMLElement).textContent = m.timerPending(pending.left);
  pendingBox.hidden = false;
  pendingBox.querySelector("button")?.addEventListener("click", async () => {
    await browser.runtime.sendMessage({ type: "harie:timer-cancel" });
    pendingBox.hidden = true;
  });
}

// 空のエディタ（FR-CAP-08）。撮った画像などを貼り付けて編集する。キャプチャしないので activeTab は使わない
document.querySelector(".blank")?.addEventListener("click", async () => {
  await browser.tabs.create({ url: browser.runtime.getURL("/editor.html") });
  window.close();
});

document.querySelector(".settings")?.addEventListener("click", async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});
