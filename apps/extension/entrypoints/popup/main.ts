// ポップアップ。押したボタンの方法で、今のタブをキャプチャする（ボタンを押したことで activeTab が付く）
import { applyDocumentLang, getLocale } from "@harie/editor/locale";
import { browser } from "wxt/browser";
import { extensionMessages } from "@/lib/messages";
import { ALL_SITES_ORIGINS, GITHUB_ORIGINS } from "@/lib/page-image";
import {
  loadPageSettings,
  originsFor,
  type PageScope,
  type PageSettings,
  savePageSettings,
} from "@/lib/page-settings";

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
    | "pageEdit"
    | "pageCopy"
    | "pageScope"
    | "pageScopeAll"
    | "pageScopeGithub"
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

// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。出すボタンと使うサイトを選ぶ。
// ボタンをオンにしたときだけ、使うサイトの権限を求める。設定か権限が変わると background がページ用のスクリプトを登録し直す
const featureBoxes = [...document.querySelectorAll<HTMLInputElement>("input[data-feature]")];
const scopeRadios = [...document.querySelectorAll<HTMLInputElement>('input[name="scope"]')];
let settings: PageSettings = await loadPageSettings();

async function render(): Promise<void> {
  const granted = await browser.permissions.contains({ origins: originsFor(settings.scope) });
  for (const box of featureBoxes) {
    box.checked = granted && settings[box.dataset.feature as "edit" | "copy"];
  }
  for (const radio of scopeRadios) radio.checked = radio.value === settings.scope;
}

async function update(next: PageSettings): Promise<void> {
  settings = next;
  await savePageSettings(next);
}

for (const box of featureBoxes) {
  box.addEventListener("change", async () => {
    const feature = box.dataset.feature as "edit" | "copy";
    try {
      if (box.checked) {
        // 権限の確認はクリックの直後に呼ぶ（ユーザー操作の中でしか求められない）。確認の間にポップアップが閉じてもよいよう、先に設定を保存する
        const asked = browser.permissions.request({ origins: originsFor(settings.scope) });
        await update({ ...settings, [feature]: true });
        if (!(await asked)) await update({ ...settings, [feature]: false });
      } else {
        await update({ ...settings, [feature]: false });
        // どのボタンも出さないなら、サイトの権限を返す
        if (!settings.edit && !settings.copy) {
          await browser.permissions.remove({ origins: [...GITHUB_ORIGINS, ...ALL_SITES_ORIGINS] });
        }
      }
    } finally {
      await render();
    }
  });
}

for (const radio of scopeRadios) {
  radio.addEventListener("change", async () => {
    const scope = radio.value as PageScope;
    const previous = settings.scope;
    try {
      const asked =
        settings.edit || settings.copy
          ? browser.permissions.request({ origins: originsFor(scope) })
          : Promise.resolve(true);
      await update({ ...settings, scope });
      if (!(await asked)) await update({ ...settings, scope: previous });
      else if (scope === "github") await browser.permissions.remove({ origins: ALL_SITES_ORIGINS });
    } finally {
      await render();
    }
  });
}
void render();
