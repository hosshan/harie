// 範囲選択・要素選択のオーバーレイ（FR-CAP-02）。拡張のボタンを押したタブにだけ、その都度注入する（activeTab）。
// 選び終えたらオーバーレイを消してから background に範囲を送る（オーバーレイが写り込まないように）。
// タイマーで撮ったとき（FR-CAP-11）は、止めた画面をオーバーレイに敷き、その上で選ぶ。要素は撮ったときの位置で選ぶ
import { browser } from "wxt/browser";
import type { Frame } from "@/lib/capture";
import { dragRect, elementRect, smallestRectAt } from "@/lib/selection";
import type { CssRect } from "@/lib/snapshot";

type Mode = "region" | "element";
type HarieWindow = Window & {
  __harieSelectMode?: Mode;
  /** 案内の文（表示言語に合わせて background が渡す） */
  __harieSelectHint?: string;
  /** タイマーで止めた画面（background が渡す） */
  __harieFrozen?: Frame | null;
  __harieOverlayCleanup?: (() => void) | undefined;
};

export default defineUnlistedScript(() => {
  const w = window as HarieWindow;
  w.__harieOverlayCleanup?.();
  const mode: Mode = w.__harieSelectMode === "element" ? "element" : "region";
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  const frozen = w.__harieFrozen ?? null;
  w.__harieFrozen = null;
  const frozenRects = frozen?.raw?.elements.map((e) => e.rect) ?? null;

  const root = document.createElement("div");
  root.dataset.harieOverlay = "";
  root.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(15,23,42,0.15);";
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;display:none;border:2px solid #B0861A;background:rgba(212,167,44,0.16);pointer-events:none;box-sizing:border-box;";
  const hint = document.createElement("div");
  hint.textContent = w.__harieSelectHint ?? "";
  hint.style.cssText =
    "position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:6px;background:#1C2024;color:#fff;font:13px/1.4 system-ui,sans-serif;pointer-events:none;";
  root.append(box, hint);
  if (frozen !== null) {
    // 止めた画面を敷く。少し暗くするのはオーバーレイだけで、切り抜くのは止めた画面そのもの
    root.style.backgroundImage = `linear-gradient(rgba(15,23,42,0.15),rgba(15,23,42,0.15)),url("${frozen.dataUrl}")`;
    root.style.backgroundSize = "100% 100%";
  }
  document.documentElement.append(root);

  const show = (r: { x: number; y: number; w: number; h: number } | null) => {
    if (r === null) {
      box.style.display = "none";
      return;
    }
    Object.assign(box.style, {
      display: "block",
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      height: `${r.h}px`,
    });
  };

  let start: { x: number; y: number } | null = null;
  let hovered: CssRect | null = null;

  const finish = (rect: { x: number; y: number; w: number; h: number } | null) => {
    cleanup();
    // オーバーレイが画面から消えてから撮るよう、描画を 2 回待つ
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void browser.runtime.sendMessage(
          rect === null
            ? { type: "harie:cancelled" }
            : { type: "harie:selected", rect, ...(frozen === null ? {} : { frame: frozen }) },
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
  /** カーソルの下の要素の矩形。止めた画面では撮ったときの要素の位置から選ぶ */
  const targetRect = (e: MouseEvent): CssRect | null => {
    if (frozenRects !== null) return smallestRectAt(frozenRects, { x: e.clientX, y: e.clientY });
    const r = target(e)?.getBoundingClientRect();
    return r === undefined ? null : { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  root.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (mode === "region") start = { x: e.clientX, y: e.clientY };
  });
  root.addEventListener("mousemove", (e) => {
    if (mode === "region") {
      if (start !== null) show(dragRect(start, { x: e.clientX, y: e.clientY }, viewport(), 1));
      return;
    }
    hovered = targetRect(e);
    show(hovered);
  });
  root.addEventListener("mouseup", (e) => {
    if (mode === "region") {
      if (start === null) return;
      const rect = dragRect(start, { x: e.clientX, y: e.clientY }, viewport());
      start = null;
      if (rect === null) {
        show(null);
        return;
      }
      finish(rect);
      return;
    }
    const r = hovered ?? targetRect(e);
    if (r === null) return;
    finish(elementRect(r, viewport()));
  });
  window.addEventListener("keydown", onKey, true);

  function cleanup() {
    window.removeEventListener("keydown", onKey, true);
    root.remove();
    w.__harieOverlayCleanup = undefined;
  }
  w.__harieOverlayCleanup = cleanup;
});
