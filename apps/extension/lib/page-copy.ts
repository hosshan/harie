// ページ上の Harie 画像で、説明文をその場でコピーするための位置（FR-FILE-12）。service worker で動く
import type { HarieDocument } from "@harie/model";
import { annotationBounds, THEMES } from "@harie/render";
import { annotationText } from "./page-image";

/** コピーできる説明文。位置は表示中の画像に対する割合（0〜1）で、ページの画像の大きさに合わせて置く */
export type CopyTarget = { x: number; y: number; w: number; h: number; text: string };

export type PageImageInfo = { harie: false } | { harie: true; targets: CopyTarget[]; all: string };

export function pageImageInfo(doc: HarieDocument): PageImageInfo {
  const theme = THEMES[doc.theme.preset] ?? THEMES.default;
  // 切り抜いているときは、切り抜いた範囲が画像になる
  const area = doc.canvas.crop ?? { x: 0, y: 0, w: doc.canvas.width, h: doc.canvas.height };
  const targets: CopyTarget[] = [];
  for (const a of doc.annotations) {
    if (a.status === "suggested") continue;
    if ((a.type !== "callout" && a.type !== "text") || a.text.trim() === "") continue;
    const b = annotationBounds(a, theme);
    targets.push({
      x: (b.x - area.x) / area.w,
      y: (b.y - area.y) / area.h,
      w: b.w / area.w,
      h: b.h / area.h,
      text: a.text.trim(),
    });
  }
  return { harie: true, targets, all: annotationText(doc) };
}
