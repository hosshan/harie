// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。利用者がポップアップで許可したサイトにだけ、
// background が registerContentScripts で入れる（integrations.md 1.5）。
// - どのサイトでも: Harie 画像にカーソルを当てると、右上に薄く編集ボタンを出す。押すと拡張のエディタで開く
// - GitHub: ファイル・差分の Harie 画像の下に、注釈データを文字で出す（選んでコピーできる）
import { getLocale } from "@harie/editor/locale";
import type { HarieDocument } from "@harie/model";
import { browser } from "wxt/browser";
import { type ExtensionMessages, extensionMessages } from "@/lib/messages";
import type { AnnotationsResponse } from "@/lib/page-fetch";
import {
  annotationText,
  githubViewscreenImages,
  isHarieImageUrl,
  isHttpUrl,
} from "@/lib/page-image";

/** これより小さい画像（アイコン・アバターなど）には編集ボタンを出さない */
const MIN_SIZE = 96;

const SYMBOL = `<svg viewBox="0 0 512 512" width="20" height="20" aria-hidden="true"><defs><clipPath id="harie-page-sq"><rect x="72" y="72" width="184" height="184" rx="25.8"/></clipPath></defs><rect x="72" y="72" width="184" height="184" rx="25.8" fill="#EBD08A"/><circle cx="309.9" cy="309.9" r="130.1" fill="#D4A72C"/><circle cx="309.9" cy="309.9" r="130.1" fill="#B0861A" clip-path="url(#harie-page-sq)"/></svg>`;

const send = <T>(message: { type: string; url: string }) =>
  browser.runtime.sendMessage(message) as Promise<T>;

export default defineUnlistedScript(() => {
  const w = window as Window & { __hariePage?: boolean };
  if (w.__hariePage) return;
  w.__hariePage = true;
  const m = extensionMessages(getLocale());
  setupEditButton(m);
  if (location.hostname === "github.com" && window.top === window) setupGitHub(m);
});

// ---- 編集ボタン（FR-FILE-13） ----

function setupEditButton(m: ExtensionMessages): void {
  const host = document.createElement("div");
  host.dataset.hariePage = "edit";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
button{position:fixed;z-index:2147483647;display:none;align-items:center;justify-content:center;width:32px;height:32px;padding:0;
border:1px solid rgba(43,38,32,.18);border-radius:8px;background:rgba(255,255,255,.85);box-shadow:0 1px 4px rgba(43,38,32,.2);
cursor:pointer;opacity:.55;transition:opacity .15s}
button:hover,button:focus-visible{opacity:1}
button[data-busy]{cursor:progress}
</style><button type="button">${SYMBOL}</button>`;
  const button = shadow.querySelector("button") as HTMLButtonElement;
  button.title = m.editOnImage;
  button.setAttribute("aria-label", m.editOnImage);
  document.documentElement.append(host);

  /** 判定済みの URL（Harie 画像か） */
  const known = new Map<string, boolean>();
  let current: { img: HTMLImageElement; url: string } | null = null;
  let hideTimer: number | undefined;
  let probeTimer: number | undefined;

  const hide = () => {
    current = null;
    button.style.display = "none";
  };
  const show = (img: HTMLImageElement, url: string) => {
    const r = img.getBoundingClientRect();
    if (r.width < MIN_SIZE || r.height < MIN_SIZE) return;
    current = { img, url };
    Object.assign(button.style, {
      display: "flex",
      left: `${Math.round(r.right - 40)}px`,
      top: `${Math.round(Math.max(r.top, 0) + 8)}px`,
    });
  };

  document.addEventListener(
    "mouseover",
    (e) => {
      if (e.target === host) {
        clearTimeout(hideTimer);
        return;
      }
      const img = e.target instanceof HTMLImageElement ? e.target : null;
      const url = img === null ? "" : img.currentSrc || img.src;
      if (img === null || !isHttpUrl(url)) {
        clearTimeout(probeTimer);
        clearTimeout(hideTimer);
        // ボタンへ移る間に消えないよう、少し待ってから消す
        hideTimer = window.setTimeout(hide, 200);
        return;
      }
      clearTimeout(hideTimer);
      clearTimeout(probeTimer);
      if (isHarieImageUrl(url) || known.get(url) === true) {
        show(img, url);
        return;
      }
      hide();
      if (known.has(url)) return;
      const r = img.getBoundingClientRect();
      if (r.width < MIN_SIZE || r.height < MIN_SIZE) return;
      // ファイル名が規則どおりでなくても、埋め込みデータがあれば Harie 画像として扱う（ADR-0004）
      probeTimer = window.setTimeout(async () => {
        try {
          const { harie } = await send<{ harie: boolean }>({ type: "harie:page-probe", url });
          known.set(url, harie);
          if (harie && img.matches(":hover")) show(img, url);
        } catch {
          known.set(url, false);
        }
      }, 250);
    },
    { capture: true, passive: true },
  );
  window.addEventListener("scroll", hide, { capture: true, passive: true });
  window.addEventListener("resize", hide, { passive: true });

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (current === null || button.dataset.busy !== undefined) return;
    button.dataset.busy = "";
    try {
      const { ok } = await send<{ ok: boolean }>({ type: "harie:page-edit", url: current.url });
      if (!ok) button.title = m.editFailed;
    } catch {
      button.title = m.editFailed;
    } finally {
      delete button.dataset.busy;
    }
  });
}

// ---- GitHub の注釈データ（FR-FILE-12） ----

function setupGitHub(m: ExtensionMessages): void {
  const done = new WeakSet<Element>();
  let timer: number | undefined;

  const scan = () => {
    // コミット・PR の差分: 画像は viewscreen.githubusercontent.com の iframe に出る
    for (const frame of document.querySelectorAll<HTMLIFrameElement>(
      'iframe[src*="viewscreen.githubusercontent.com"]',
    )) {
      if (done.has(frame)) continue;
      done.add(frame);
      const info = githubViewscreenImages(frame.src);
      if (info === null) continue;
      const name = info.path.split("/").at(-1) ?? "";
      if (!isHarieImageUrl(`https://github.com/${name}`)) continue;
      // 変更された画像は、変更前・変更後の 2 枚の URL が入る（並びは前・後）
      const labels = info.urls.length === 2 ? [m.diffBefore, m.diffAfter] : [];
      let anchor: Element = frame;
      info.urls.forEach((url, i) => {
        const panel = createPanel(m, name, url, labels[i]);
        anchor.after(panel);
        anchor = panel;
      });
    }
    // ファイルの表示（/blob/...）: 表示中のファイルそのものの画像だけ（README の中の画像などは除く）
    if (location.pathname.includes("/blob/")) {
      for (const img of document.querySelectorAll<HTMLImageElement>("img")) {
        if (done.has(img)) continue;
        let path = "";
        try {
          path = new URL(img.src).pathname;
        } catch {
          continue;
        }
        if (path !== location.pathname || !isHarieImageUrl(img.src)) continue;
        done.add(img);
        img.after(createPanel(m, path.split("/").at(-1) ?? "", img.src));
      }
    }
  };

  scan();
  // GitHub は画面を差し替えて遷移するので、変化があるたびに探し直す
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(scan, 300);
  }).observe(document.body, { childList: true, subtree: true });
}

function createPanel(
  m: ExtensionMessages,
  fileName: string,
  url: string,
  label?: string,
): HTMLElement {
  const host = document.createElement("div");
  host.dataset.hariePage = "annotations";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
:host{display:block;margin:12px 0;text-align:left}
section{border:1px solid #E6DCC6;border-radius:8px;background:#FBF6E9;color:#2B2620;
font:13px/1.6 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;padding:10px 12px}
header{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-bottom:6px}
h2{display:flex;align-items:center;gap:6px;margin:0;font-size:13px;font-weight:600}
.file{color:#7A7064;font-weight:400;overflow-wrap:anywhere}
.actions{display:flex;gap:6px;margin-left:auto}
button{font:inherit;font-size:12px;padding:2px 10px;border:1px solid #E6DCC6;border-radius:6px;background:#fff;color:#2B2620;cursor:pointer}
button:hover{border-color:#B0861A}
pre{margin:0;padding:8px 10px;border-radius:6px;background:#fff;border:1px solid #E6DCC6;white-space:pre-wrap;overflow-wrap:anywhere;
font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;user-select:text;max-height:480px;overflow:auto}
details{margin-top:6px}
summary{cursor:pointer;color:#7A7064;font-size:12px}
details pre{margin-top:4px}
.note{margin:0 0 6px;color:#86650F;font-size:12px}
.muted{margin:0;color:#7A7064}
</style><section></section>`;
  const section = shadow.querySelector("section") as HTMLElement;
  section.setAttribute("aria-label", m.panelTitle);

  const header = document.createElement("header");
  const h2 = document.createElement("h2");
  h2.innerHTML = SYMBOL;
  const title = document.createElement("span");
  title.textContent = label === undefined ? m.panelTitle : m.panelTitleWith(label);
  const file = document.createElement("span");
  file.className = "file";
  file.textContent = fileName;
  h2.append(title, file);
  header.append(h2);
  const status = document.createElement("p");
  status.className = "muted";
  status.textContent = m.panelLoading;
  section.append(header, status);

  void send<AnnotationsResponse>({ type: "harie:page-annotations", url })
    .catch((): AnnotationsResponse => ({ ok: false, reason: "failed" }))
    .then((res) => {
      if (!res.ok) {
        // ファイル名だけが規則どおりで、中身が Harie ファイルでないときは何も出さない
        if (res.reason === "not-harie") host.remove();
        else status.textContent = m.panelFailed;
        return;
      }
      status.remove();
      fill(m, section, header, res.doc, res.mismatch);
    });
  return host;
}

function fill(
  m: ExtensionMessages,
  section: HTMLElement,
  header: HTMLElement,
  doc: HarieDocument,
  mismatch: boolean,
): void {
  const text = annotationText(doc);
  const json = JSON.stringify(doc, null, 2);
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(copyButton(m, m.panelCopyText, text), copyButton(m, m.panelCopyJson, json));
  header.append(actions);
  if (mismatch) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = m.panelMismatch;
    section.append(note);
  }
  const pre = document.createElement("pre");
  pre.textContent = text === "" ? m.panelEmpty : text;
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = m.panelJson;
  const jsonPre = document.createElement("pre");
  jsonPre.textContent = json;
  details.append(summary, jsonPre);
  section.append(pre, details);
}

function copyButton(m: ExtensionMessages, label: string, value: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = m.panelCopied;
      setTimeout(() => {
        button.textContent = label;
      }, 1500);
    } catch {
      // クリップボードを使えないときも、文字は選んでコピーできる
    }
  });
  return button;
}
