// スクロールバーが内容に重なるかを調べ、<html data-harie-scrollbars> に印を付ける。
// macOS の既定やスマホのスクロールバーは内容の上に重ねて描かれ（幅 0）、場所を取らない。
// そのときだけ、スクロールする欄の右に余白（--harie-scrollbar-room）を足してバーをそこに逃がす。
// 場所を取るスクロールバー（Windows・Linux、macOS で「常に表示」）はもともと内容の外に出るので足さない
import { useEffect } from "react";

export type ScrollbarKind = "overlay" | "classic";

/** スクロールバーの幅（offsetWidth - clientWidth）から種類を決める */
export function scrollbarKind(width: number): ScrollbarKind {
  return width > 0 ? "classic" : "overlay";
}

/** 画面外に小さな箱を置いて、スクロールバーの幅を測る */
export function measureScrollbarWidth(doc: Document): number {
  const probe = doc.createElement("div");
  probe.style.cssText =
    "position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden";
  doc.body.appendChild(probe);
  const width = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return width;
}

export function markScrollbarKind(doc: Document = document): ScrollbarKind {
  const kind = scrollbarKind(measureScrollbarWidth(doc));
  doc.documentElement.dataset.harieScrollbars = kind;
  return kind;
}

/**
 * スクロールする欄を持つ部品で呼ぶ。マウスをつなぐと macOS の「自動」設定ではバーの種類が変わるので、
 * 画面の大きさが変わったときにも測り直す
 */
export function useScrollbarKind(): void {
  useEffect(() => {
    markScrollbarKind();
    const onResize = () => markScrollbarKind();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
}
