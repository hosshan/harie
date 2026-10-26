// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。利用者がポップアップで許可したサイトにだけ、
// background が registerContentScripts で入れる（integrations.md 1.5）。ページの見た目は変えず、
// - Harie 画像にカーソルを当てると、右上に薄く編集ボタンと「まとめてコピー」を出す。編集は拡張のエディタで開く
// - 説明文（吹き出し・文字）の枠にカーソルを当てると、その枠の上にコピーボタンを出す
// 説明文は content script（ページの JS から見えない隔離された環境）の中だけに持ち、DOM には書かない。
import { getLocale } from "@harie/editor/locale";
import { browser } from "wxt/browser";
import { extensionMessages } from "@/lib/messages";
import type { CopyTarget, PageImageInfo } from "@/lib/page-copy";
import { isHarieImageUrl, isHttpUrl } from "@/lib/page-image";
import {
  DEFAULT_PAGE_SETTINGS,
  loadPageSettings,
  onPageSettingsChanged,
  type PageSettings,
} from "@/lib/page-settings";

/** これより小さい画像（アイコン・アバターなど）は調べない */
const MIN_SIZE = 96;
/** 枠の当たり判定の余白（CSS px） */
const HIT_PAD = 6;

const SYMBOL = `<svg viewBox="0 0 512 512" width="18" height="18" aria-hidden="true"><defs><clipPath id="harie-page-sq"><rect x="72" y="72" width="184" height="184" rx="25.8"/></clipPath></defs><rect x="72" y="72" width="184" height="184" rx="25.8" fill="#EBD08A"/><circle cx="309.9" cy="309.9" r="130.1" fill="#D4A72C"/><circle cx="309.9" cy="309.9" r="130.1" fill="#B0861A" clip-path="url(#harie-page-sq)"/></svg>`;
const icon = (body: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const COPY = icon(
  '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
);
const COPY_ALL = icon('<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>');
const CHECK = icon('<path d="M20 6 9 17l-5-5"/>');

const send = <T>(message: { type: string; url: string }) =>
  browser.runtime.sendMessage(message) as Promise<T>;

export default defineUnlistedScript(() => {
  const w = window as Window & { __hariePage?: boolean };
  if (w.__hariePage) return;
  w.__hariePage = true;
  const m = extensionMessages(getLocale());

  const host = document.createElement("div");
  host.dataset.hariePage = "";
  // ページの CSS の影響を受けないよう Shadow DOM に入れる
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
.bar,.copy{position:fixed;z-index:2147483647;display:none;gap:4px}
button{position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;margin:0;
border:1px solid rgba(43,38,32,.18);border-radius:8px;background:rgba(255,255,255,.88);color:#2B2620;
box-shadow:0 1px 4px rgba(43,38,32,.2);cursor:pointer;opacity:.55;transition:opacity .15s}
button:hover,button:focus-visible{opacity:1}
button[data-done]{color:#1F7A3D;opacity:1}
.icon{display:flex}
.copy button{width:26px;height:26px;border-radius:6px}
.tip{position:absolute;top:calc(100% + 6px);right:0;display:none;padding:4px 8px;border-radius:6px;background:#2B2620;color:#fff;
font:12px/1.4 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;white-space:nowrap;pointer-events:none}
button:hover .tip,button:focus-visible .tip{display:block}
</style>
<div class="bar"><button type="button" data-action="all"><span class="icon">${COPY_ALL}</span><span class="tip" aria-hidden="true"></span></button><button type="button" data-action="edit"><span class="icon">${SYMBOL}</span><span class="tip" aria-hidden="true"></span></button></div>
<div class="copy"><button type="button" data-action="one"><span class="icon">${COPY}</span><span class="tip" aria-hidden="true"></span></button></div>`;
  const bar = shadow.querySelector(".bar") as HTMLElement;
  const copyBox = shadow.querySelector(".copy") as HTMLElement;
  const buttons = {
    all: shadow.querySelector('[data-action="all"]') as HTMLButtonElement,
    edit: shadow.querySelector('[data-action="edit"]') as HTMLButtonElement,
    one: shadow.querySelector('[data-action="one"]') as HTMLButtonElement,
  };
  /** ボタンの名前。アイコンだけでは何をするか分かりにくいので、カーソルを当てると同じ文をツールチップに出す */
  const label = (b: HTMLButtonElement, text: string) => {
    b.setAttribute("aria-label", text);
    (b.querySelector(".tip") as HTMLElement).textContent = text;
  };
  label(buttons.all, m.copyAll);
  label(buttons.edit, m.editOnImage);
  label(buttons.one, m.copyText);
  document.documentElement.append(host);

  // 出すボタン（ポップアップの設定）。変わったら、開いているページにもすぐ反映する
  let options: PageSettings = DEFAULT_PAGE_SETTINGS;
  void loadPageSettings().then((next) => {
    options = next;
  });
  onPageSettingsChanged((next) => {
    options = next;
    hide();
  });

  const known = new Map<string, PageImageInfo>();
  const pending = new Set<string>();
  let current: { img: HTMLImageElement; url: string } | null = null;
  let target: CopyTarget | null = null;
  let hideTimer: number | undefined;
  let readTimer: number | undefined;

  const infoOf = (url: string) => {
    const info = known.get(url);
    return info?.harie === true ? info : null;
  };

  const hide = () => {
    current = null;
    target = null;
    bar.style.display = "none";
    copyBox.style.display = "none";
  };

  /** 画像の右上にバーを、カーソルの下の説明文の枠の右上にコピーボタンを置く */
  const place = (x: number, y: number) => {
    if (current === null) return;
    const info = infoOf(current.url);
    if (info === null) {
      bar.style.display = "none";
      copyBox.style.display = "none";
      return;
    }
    const r = current.img.getBoundingClientRect();
    const showAll = options.copy && info.all !== "";
    const count = Number(showAll) + Number(options.edit);
    buttons.all.style.display = showAll ? "flex" : "none";
    buttons.edit.style.display = options.edit ? "flex" : "none";
    Object.assign(bar.style, {
      display: count === 0 ? "none" : "flex",
      left: `${Math.round(r.right - 4 - count * 34)}px`,
      top: `${Math.round(Math.max(r.top, 0) + 8)}px`,
    });
    if (!options.copy) {
      copyBox.style.display = "none";
      target = null;
      return;
    }
    const hit = info.targets.find((t) => {
      const left = r.left + t.x * r.width;
      const top = r.top + t.y * r.height;
      return (
        x >= left - HIT_PAD &&
        x <= left + t.w * r.width + HIT_PAD &&
        y >= top - HIT_PAD &&
        y <= top + t.h * r.height + HIT_PAD
      );
    });
    if (hit === undefined) {
      if (target !== null) copyBox.style.display = "none";
      target = null;
      return;
    }
    if (hit !== target) delete buttons.one.dataset.done;
    target = hit;
    // 枠の右上の角に、少し重ねて置く
    const right = r.left + (hit.x + hit.w) * r.width;
    const top = r.top + hit.y * r.height;
    Object.assign(copyBox.style, {
      display: "flex",
      left: `${Math.round(right - 14)}px`,
      top: `${Math.round(top - 14)}px`,
    });
  };

  const read = (url: string, then: () => void) => {
    if (known.has(url) || pending.has(url)) return;
    pending.add(url);
    void send<PageImageInfo>({ type: "harie:page-read", url })
      .catch((): PageImageInfo => ({ harie: false }))
      .then((info) => {
        known.set(url, info);
        pending.delete(url);
        then();
      });
  };

  let last = { x: 0, y: 0 };
  document.addEventListener(
    "mousemove",
    (e) => {
      last = { x: e.clientX, y: e.clientY };
      if (e.target === host) {
        clearTimeout(hideTimer);
        return;
      }
      const img = e.target instanceof HTMLImageElement ? e.target : null;
      const url = img === null ? "" : img.currentSrc || img.src;
      if (img === null || !isHttpUrl(url)) {
        clearTimeout(readTimer);
        clearTimeout(hideTimer);
        // ボタンへ移る間に消えないよう、少し待ってから消す
        hideTimer = window.setTimeout(hide, 200);
        return;
      }
      clearTimeout(hideTimer);
      if (current?.img !== img) {
        clearTimeout(readTimer);
        hide();
        const r = img.getBoundingClientRect();
        if (r.width < MIN_SIZE || r.height < MIN_SIZE) return;
        current = { img, url };
        if (!known.has(url)) {
          const again = () => {
            if (current?.img === img) place(last.x, last.y);
          };
          // ファイル名が規則どおりならすぐに、そうでなければ少し止まったら読む（判定の本番は埋め込みデータ。ADR-0004）
          if (isHarieImageUrl(url)) read(url, again);
          else readTimer = window.setTimeout(() => read(url, again), 250);
        }
      }
      place(e.clientX, e.clientY);
    },
    { capture: true, passive: true },
  );
  window.addEventListener("scroll", hide, { capture: true, passive: true });
  window.addEventListener("resize", hide, { passive: true });

  const done = (b: HTMLButtonElement, original: string) => {
    const icon = b.querySelector(".icon") as HTMLElement;
    b.dataset.done = "";
    icon.innerHTML = CHECK;
    label(b, m.copied);
    setTimeout(() => {
      delete b.dataset.done;
      icon.innerHTML = original;
      label(b, b === buttons.one ? m.copyText : m.copyAll);
    }, 1200);
  };

  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // http のページなどで Clipboard API が使えないとき。コピーの間だけ文字を置く
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      shadow.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  };

  for (const b of Object.values(buttons)) {
    b.addEventListener("mousedown", (e) => e.preventDefault());
  }
  shadow.addEventListener("click", async (e) => {
    const b = (e.target as Element).closest("button");
    if (b === null || current === null) return;
    e.preventDefault();
    e.stopPropagation();
    const info = infoOf(current.url);
    if (b === buttons.one && target !== null) {
      if (await copy(target.text)) done(b, COPY);
    } else if (b === buttons.all && info !== null) {
      if (await copy(info.all)) done(b, COPY_ALL);
    } else if (b === buttons.edit && b.dataset.busy === undefined) {
      b.dataset.busy = "";
      try {
        const { ok } = await send<{ ok: boolean }>({ type: "harie:page-edit", url: current.url });
        if (!ok) label(b, m.editFailed);
      } catch {
        label(b, m.editFailed);
      } finally {
        delete b.dataset.busy;
      }
    }
  });
});
