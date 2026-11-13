// 範囲選択・要素選択のオーバーレイ（FR-CAP-02）。拡張のボタンを押したタブにだけ、その都度注入する（activeTab）。
// 選び終えたらオーバーレイを消してから background に範囲を送る（オーバーレイが写り込まないように）。
// 範囲選択では、撮る画像の幅×高さを数値で決められる（FR-CAP-10）。決めると、その大きさの枠がカーソルに付いてきて、
// クリックした位置で撮る。欄は毎回空から始め、空のままならこれまでどおりドラッグで選ぶ
import { browser } from "wxt/browser";
import type { SelectText } from "@/lib/capture";
import { dragRect, elementRect, fixedRect, parseSelectSide } from "@/lib/selection";

type Mode = "region" | "element";
type HarieWindow = Window & {
  __harieSelectMode?: Mode;
  /** 案内の文（表示言語に合わせて background が渡す） */
  __harieSelectHint?: string;
  /** 大きさを決める欄の文言（同上） */
  __harieSelectText?: SelectText;
  __harieOverlayCleanup?: (() => void) | undefined;
};
type Rect = { x: number; y: number; w: number; h: number };
type Size = { width: number; height: number };

const FONT = "13px/1.4 system-ui,sans-serif";

export default defineUnlistedScript(() => {
  const w = window as HarieWindow;
  w.__harieOverlayCleanup?.();
  const mode: Mode = w.__harieSelectMode === "element" ? "element" : "region";
  const text = w.__harieSelectText;
  const hintText = w.__harieSelectHint ?? "";
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  // 画像のピクセル ÷ CSS ピクセル（撮った画像の大きさで数える）
  const scale = () => window.devicePixelRatio || 1;
  const toImage = (r: Rect): Size => ({
    width: Math.round(r.w * scale()),
    height: Math.round(r.h * scale()),
  });

  const root = document.createElement("div");
  root.dataset.harieOverlay = "";
  root.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(15,23,42,0.15);";
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;display:none;border:2px solid #B0861A;background:rgba(212,167,44,0.16);pointer-events:none;box-sizing:border-box;";
  // 枠の大きさ（撮れる画像のピクセル）を枠の下に出す
  const label = document.createElement("div");
  label.style.cssText = `position:fixed;display:none;padding:2px 6px;border-radius:4px;background:#1C2024;color:#fff;font:${FONT};font-variant-numeric:tabular-nums;pointer-events:none;white-space:nowrap;`;

  // 案内と大きさの欄。ページの CSS・キー操作の影響を受けないよう Shadow DOM に入れる
  const panelHost = document.createElement("div");
  // 横幅いっぱいの入れ物の中央に置く（left:50% だと幅が画面の半分に縮み、案内が折り返す）。
  // 入れ物そのものはクリックを受けず、案内の部分だけが受ける
  panelHost.style.cssText =
    "position:fixed;top:12px;left:12px;right:12px;display:flex;justify-content:center;pointer-events:none;";
  const shadow = panelHost.attachShadow({ mode: "open" });
  const panel = document.createElement("div");
  panel.style.cssText = `pointer-events:auto;cursor:default;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;padding:6px 12px;border-radius:6px;background:#1C2024;color:#fff;font:${FONT};`;
  const hint = document.createElement("span");
  hint.textContent = hintText;
  // 要素選択では案内の下の要素も選べるよう、案内はクリックを受けない
  if (mode === "element") panel.style.pointerEvents = "none";
  panel.append(hint);
  shadow.append(panel);

  let fixed: Size | null = null;
  let tooLarge = false;
  const inputs: HTMLInputElement[] = [];
  if (mode === "region" && text !== undefined) {
    const fields = document.createElement("span");
    fields.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
    const field = (name: string, short: string) => {
      const input = document.createElement("input");
      input.inputMode = "numeric";
      input.placeholder = short;
      input.setAttribute("aria-label", name);
      input.title = name;
      input.style.cssText = `all:initial;box-sizing:border-box;width:64px;padding:2px 6px;border:1px solid #4B5563;border-radius:4px;background:#fff;color:#1C2024;font:${FONT};font-variant-numeric:tabular-nums;`;
      inputs.push(input);
      return input;
    };
    const times = document.createElement("span");
    times.textContent = "×";
    const unit = document.createElement("span");
    unit.textContent = "px";
    fields.append(field(text.width, "W"), times, field(text.height, "H"), unit);
    panel.append(fields);
  }
  root.append(box, label, panelHost);
  document.documentElement.append(root);

  const show = (r: Rect | null) => {
    if (r === null) {
      box.style.display = "none";
      label.style.display = "none";
      return;
    }
    Object.assign(box.style, {
      display: "block",
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      height: `${r.h}px`,
    });
    const size = fixed ?? toImage(r);
    label.textContent = `${size.width} × ${size.height}`;
    // 枠の下に置く。画面の下端に近ければ枠の内側の下に置く
    const below = r.y + r.h + 6;
    Object.assign(label.style, {
      display: "block",
      left: `${r.x}px`,
      top: `${below + 24 > window.innerHeight ? r.y + r.h - 28 : below}px`,
    });
  };

  // 幅と高さの両方が入っていれば、その大きさで撮る
  const updateFixed = () => {
    const [wi, hi] = inputs;
    if (wi === undefined || hi === undefined || text === undefined) return;
    const width = parseSelectSide(wi.value);
    const height = parseSelectSide(hi.value);
    fixed = width !== null && height !== null ? { width, height } : null;
    tooLarge = fixed !== null && fixedRect({ x: 0, y: 0 }, fixed, viewport(), scale()) === null;
    for (const [input, v] of [
      [wi, width],
      [hi, height],
    ] as const) {
      input.style.borderColor = input.value.trim() !== "" && v === null ? "#F97316" : "#4B5563";
    }
    hint.textContent = fixed === null ? hintText : tooLarge ? text.tooLarge : text.fixedHint;
    if (fixed === null || tooLarge) show(null);
  };
  for (const input of inputs) {
    input.addEventListener("input", updateFixed);
  }
  // 入力中のキーをページのショートカットに渡さない（Esc は下の onKey で受ける）
  for (const type of ["keydown", "keyup", "keypress"] as const) {
    panelHost.addEventListener(type, (e) => {
      if ((e as KeyboardEvent).key !== "Escape") e.stopPropagation();
    });
  }
  let start: { x: number; y: number } | null = null;
  let hovered: Element | null = null;

  const finish = (rect: Rect | null, size: Size | null = null) => {
    cleanup();
    // オーバーレイが画面から消えてから撮るよう、描画を 2 回待つ
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void browser.runtime.sendMessage(
          rect === null
            ? { type: "harie:cancelled" }
            : { type: "harie:selected", rect, ...(size === null ? {} : { size }) },
        );
      }),
    );
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    finish(null);
  };
  const target = (e: MouseEvent) =>
    document.elementsFromPoint(e.clientX, e.clientY).find((el) => !root.contains(el)) ?? null;
  const onPanel = (e: Event) => e.composedPath().includes(panelHost);
  const point = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY });

  root.addEventListener("mousedown", (e) => {
    if (onPanel(e)) return;
    e.preventDefault();
    // 入力欄から離れたことがわかるよう、フォーカスを外す
    (shadow.activeElement as HTMLElement | null)?.blur();
    if (mode !== "region") return;
    if (fixed !== null) {
      if (tooLarge) return;
      const rect = fixedRect(point(e), fixed, viewport(), scale());
      if (rect !== null) finish(rect, fixed);
      return;
    }
    start = point(e);
  });
  root.addEventListener("mousemove", (e) => {
    if (onPanel(e)) return;
    if (mode === "region") {
      if (fixed !== null) {
        show(tooLarge ? null : fixedRect(point(e), fixed, viewport(), scale()));
        return;
      }
      if (start !== null) show(dragRect(start, point(e), viewport(), 1));
      return;
    }
    hovered = target(e);
    const r = hovered?.getBoundingClientRect();
    show(r === undefined ? null : { x: r.left, y: r.top, w: r.width, h: r.height });
  });
  root.addEventListener("mouseup", (e) => {
    if (mode === "region") {
      if (start === null) return;
      const rect = dragRect(start, point(e), viewport());
      start = null;
      if (rect === null) {
        show(null);
        return;
      }
      finish(rect);
      return;
    }
    if (onPanel(e)) return;
    const el = hovered ?? target(e);
    if (el === null) return;
    const r = el.getBoundingClientRect();
    finish(elementRect({ x: r.left, y: r.top, w: r.width, h: r.height }, viewport()));
  });
  window.addEventListener("keydown", onKey, true);

  function cleanup() {
    window.removeEventListener("keydown", onKey, true);
    root.remove();
    w.__harieOverlayCleanup = undefined;
  }
  w.__harieOverlayCleanup = cleanup;
});
