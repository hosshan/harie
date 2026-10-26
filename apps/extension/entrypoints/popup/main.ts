// ポップアップ。押したボタンの方法で、今のタブをキャプチャする（ボタンを押したことで activeTab が付く）
import { applyDocumentLang, getLocale } from "@harie/editor/locale";
import { browser } from "wxt/browser";
import { extensionMessages } from "@/lib/messages";
import { normalizeSite, PAGE_ORIGINS } from "@/lib/page-image";
import {
  loadPageSettings,
  MAX_SITES,
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
    | "pageSites"
    | "pageSitesAll"
    | "pageSiteAdd"
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

// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。出すボタンと、ボタンを出すサイト（空ならすべて）を選ぶ。
// ボタンをオンにしたときだけ、画像を読むためのサイトの権限を求める。設定か権限が変わると background がページ用のスクリプトを登録し直す
const featureBoxes = [...document.querySelectorAll<HTMLInputElement>("input[data-feature]")];
const siteList = document.querySelector(".sites") as HTMLUListElement;
const sitesAll = document.querySelector(".sites-all") as HTMLElement;
const addForm = document.querySelector(".add-site") as HTMLFormElement;
const siteInput = addForm.elements.namedItem("site") as HTMLInputElement;
const siteError = document.querySelector(".site-error") as HTMLElement;
siteInput.placeholder = m.pageSitePlaceholder;
siteInput.setAttribute("aria-label", m.pageSiteInput);
let settings: PageSettings = await loadPageSettings();

async function render(): Promise<void> {
  const granted = await browser.permissions.contains({ origins: PAGE_ORIGINS });
  for (const box of featureBoxes) {
    box.checked = granted && settings[box.dataset.feature as "edit" | "copy"];
  }
  siteList.replaceChildren(
    ...settings.sites.map((site) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = site;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", m.pageSiteRemove(site));
      remove.addEventListener("click", async () => {
        await update({ ...settings, sites: settings.sites.filter((s) => s !== site) });
        await render();
      });
      li.append(name, remove);
      return li;
    }),
  );
  siteList.hidden = settings.sites.length === 0;
  sitesAll.hidden = settings.sites.length > 0;
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
        const asked = browser.permissions.request({ origins: PAGE_ORIGINS });
        await update({ ...settings, [feature]: true });
        if (!(await asked)) await update({ ...settings, [feature]: false });
      } else {
        await update({ ...settings, [feature]: false });
        // どのボタンも出さないなら、サイトの権限を返す
        if (!settings.edit && !settings.copy) {
          await browser.permissions.remove({ origins: PAGE_ORIGINS }).catch(() => false);
        }
      }
    } finally {
      await render();
    }
  });
}

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const site = normalizeSite(siteInput.value);
  if (site === null) {
    siteError.textContent = m.pageSiteInvalid;
    return;
  }
  if (!settings.sites.includes(site) && settings.sites.length >= MAX_SITES) {
    siteError.textContent = m.pageSiteTooMany;
    return;
  }
  siteError.textContent = "";
  siteInput.value = "";
  if (!settings.sites.includes(site))
    await update({ ...settings, sites: [...settings.sites, site] });
  await render();
});
void render();
