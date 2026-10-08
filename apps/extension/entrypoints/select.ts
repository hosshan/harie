// 範囲選択・要素選択のオーバーレイ（FR-CAP-02）。拡張のボタンを押したタブにだけ、その都度注入する（activeTab）。
// 選び終えたらオーバーレイを消してから background に範囲を送る（オーバーレイが写り込まないように）
import { browser } from "wxt/browser";
import { dragRect, elementRect } from "@/lib/selection";

type Mode = "region" | "element";
type HarieWindow = Window & {
  __harieSelectMode?: Mode;
  __harieOverlayCleanup?: (() => void) | undefined;
};

export default defineUnlistedScript(() => {
  const w = window as HarieWindow;
  w.__harieOverlayCleanup?.();
  const mode: Mode = w.__harieSelectMode === "element" ? "element" : "region";
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  const root = document.createElement("div");
  root.dataset.harieOverlay = "";
  root.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(15,23,42,0.15);";
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;display:none;border:2px solid #0B6BCB;background:rgba(11,107,203,0.12);pointer-events:none;box-sizing:border-box;";
  const hint = document.createElement("div");
  hint.textContent =
    mode === "region"
      ? "撮りたい範囲をドラッグしてください（Esc でやめる）"
      : "撮りたい要素をクリックしてください（Esc でやめる）";
  hint.style.cssText =
    "position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:6px;background:#1C2024;color:#fff;font:13px/1.4 system-ui,sans-serif;pointer-events:none;";
  root.append(box, hint);
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
  let hovered: Element | null = null;

  const finish = (rect: { x: number; y: number; w: number; h: number } | null) => {
    cleanup();
    // オーバーレイが画面から消えてから撮るよう、描画を 2 回待つ
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void browser.runtime.sendMessage(
          rect === null ? { type: "harie:cancelled" } : { type: "harie:selected", rect },
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

  root.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (mode === "region") start = { x: e.clientX, y: e.clientY };
  });
  root.addEventListener("mousemove", (e) => {
    if (mode === "region") {
      if (start !== null) show(dragRect(start, { x: e.clientX, y: e.clientY }, viewport(), 1));
      return;
    }
    hovered = target(e);
    const r = hovered?.getBoundingClientRect();
    show(r === undefined ? null : { x: r.left, y: r.top, w: r.width, h: r.height });
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
