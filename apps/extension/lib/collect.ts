// ページの中で動かす DOM スナップショットの取得（integrations.md 1.3）。
// chrome.scripting.executeScript({ func }) で関数ごと送るので、外の変数・import を使わない（すべて関数の中に書く）
import type { RawSnapshot } from "./snapshot";

export function collectDomSnapshot(): RawSnapshot {
  const MAX_ELEMENTS = 1500;
  const MAX_TEXT = 200;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const INTERACTIVE =
    "a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=textbox],[role=combobox]";
  const OTHERS =
    "h1,h2,h3,h4,h5,h6,label,th,td,li,p,span,dt,dd,img[alt],[role=heading],[aria-label]";

  const clean = (s: string | null | undefined) =>
    (s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  const textOf = (el: Element) => clean((el as HTMLElement).innerText ?? el.textContent);
  const ownText = (el: Element) =>
    clean(
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join(" "),
    );

  const ROLES: Record<string, string> = {
    A: "link",
    BUTTON: "button",
    SELECT: "combobox",
    TEXTAREA: "textbox",
    SUMMARY: "button",
    LABEL: "label",
    TH: "columnheader",
    TD: "cell",
    LI: "listitem",
    IMG: "img",
    H1: "heading",
    H2: "heading",
    H3: "heading",
    H4: "heading",
    H5: "heading",
    H6: "heading",
  };
  const roleOf = (el: Element): string => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    if (el instanceof HTMLInputElement) {
      if (["button", "submit", "reset"].includes(el.type)) return "button";
      if (el.type === "checkbox" || el.type === "radio") return el.type;
      return "textbox";
    }
    return ROLES[el.tagName] ?? "text";
  };

  const nameOf = (el: Element): string => {
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      if (clean(t)) return clean(t);
    }
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      const label = el.labels?.[0];
      if (label) return textOf(label);
      if ("placeholder" in el && el.placeholder) return clean(el.placeholder);
    }
    if (el instanceof HTMLImageElement) return clean(el.alt);
    return clean(el.getAttribute("title"));
  };

  const hintOf = (el: Element): RawSnapshot["elements"][number]["piiHint"] => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
    const type = el instanceof HTMLInputElement ? el.type : "";
    const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
    const key = `${el.name} ${el.id}`.toLowerCase();
    if (type === "email" || ac.includes("email") || /mail/.test(key)) return "email";
    if (type === "tel" || ac.includes("tel") || /tel|phone/.test(key)) return "phone";
    if (ac.includes("cc-number") || /card|account/.test(key)) return "id";
    if (/address|postal|street/.test(ac) || /address|zip|postal|住所/.test(key)) return "address";
    if (/name/.test(ac) || /name|氏名|名前/.test(key)) return "name";
    return null;
  };

  const visible = (el: Element, r: DOMRect) => {
    if (r.width < 2 || r.height < 2) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) !== 0;
  };

  const seen = new Set<Element>();
  const elements: RawSnapshot["elements"] = [];
  const add = (el: Element, interactive: boolean) => {
    if (seen.has(el) || elements.length >= MAX_ELEMENTS) return;
    seen.add(el);
    if (el.closest("[data-harie-overlay]")) return;
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) return;
    const role = roleOf(el);
    const name = nameOf(el);
    let text = "";
    if (el instanceof HTMLInputElement) {
      // パスワードの値は取らない
      text = el.type === "password" ? "" : clean(el.value);
    } else if (el instanceof HTMLTextAreaElement) {
      text = clean(el.value);
    } else {
      text =
        interactive || /^H[1-6]$|^LABEL$|^TH$|^TD$/.test(el.tagName) ? textOf(el) : ownText(el);
    }
    // 文字も名前もない、ただの入れ物は取らない
    if (!interactive && text === "" && name === "") return;
    const piiHint = hintOf(el);
    elements.push({
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      role,
      ...(name ? { name } : {}),
      ...(text ? { text } : {}),
      ...(piiHint ? { piiHint } : {}),
    });
  };
  // 操作できる要素を先に入れる（AI に渡す数に上限があるため）
  for (const el of document.querySelectorAll(INTERACTIVE)) add(el, true);
  for (const el of document.querySelectorAll(OTHERS)) add(el, false);

  return {
    url: location.href,
    viewport: { width: vw, height: vh, devicePixelRatio: window.devicePixelRatio || 1 },
    elements,
  };
}
