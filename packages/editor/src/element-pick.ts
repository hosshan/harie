// 要素で囲む道具（FR-EDIT-15）。Chrome 拡張で撮った画像では、ページの要素の位置と名前（DOM）がわかるので、
// クリックした要素にぴったりの枠を描き、番号と、要素の名前から作った説明文の吹き出しを付ける。AI は使わない
import type { Annotation, HarieDocument, Point, Rect, Style } from "@harie/model";
import { completeSteps } from "@harie/render";
import { newAnnotationId } from "./history";

/** 選べる要素。座標はキャンバス（画像）のピクセル */
export type PickableElement = {
  rect: Rect;
  /** ARIA のロールに近い種類（button / link / textbox など） */
  role: string;
  /** 画面に出ている名前（ボタンの文字・入力欄のラベルなど）。なければ空 */
  label: string;
};

/**
 * 枠を要素から離す余白（ページの CSS px）。枠の線が要素の縁や文字に重ならず、要素がひと目で読めるように。
 * 画像のピクセルでは、撮ったときの devicePixelRatio を掛ける（Retina の 2 倍の画像なら 16px）
 */
export const ELEMENT_PADDING = 8;

/** 画像のピクセルでの余白。pixelRatio は画像の 1px がページの何 CSS px か（撮ったときの devicePixelRatio） */
export function elementPadding(pixelRatio: number): number {
  return Math.round(
    ELEMENT_PADDING * (Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1),
  );
}

/** 点を含む要素のうち、いちばん小さいもの（入れ子なら内側）。なければ undefined */
export function pickElement(
  elements: readonly PickableElement[],
  p: Point,
): PickableElement | undefined {
  let best: PickableElement | undefined;
  for (const e of elements) {
    const { x, y, w, h } = e.rect;
    if (w <= 0 || h <= 0 || p.x < x || p.y < y || p.x > x + w || p.y > y + h) continue;
    if (best === undefined || w * h < best.rect.w * best.rect.h) best = e;
  }
  return best;
}

/** 要素の矩形に余白（画像のピクセル）を足し、キャンバスに収める */
export function elementBox(
  rect: Rect,
  canvas: { width: number; height: number },
  padding: number = ELEMENT_PADDING,
): Rect {
  const x = Math.max(0, Math.round(rect.x - padding));
  const y = Math.max(0, Math.round(rect.y - padding));
  const right = Math.min(canvas.width, Math.round(rect.x + rect.w + padding));
  const bottom = Math.min(canvas.height, Math.round(rect.y + rect.h + padding));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

export type ElementStepOptions = {
  calloutText: string;
  /** 枠と要素の間の余白（画像のピクセル）。既定は ELEMENT_PADDING */
  padding?: number | undefined;
  rectStyle?: Style | undefined;
  calloutStyle?: Style | undefined;
  badgeStyle?: Style | undefined;
};

/**
 * 要素を囲む枠と、その枠に紐付けた番号・吹き出しを足す操作。番号は今ある最大の次、
 * 吹き出しはほかの注釈に重ならない側に置く（「番号と吹き出しを付ける」と同じ置き方。FR-EDIT-14）
 */
export function elementStepOps(
  doc: HarieDocument,
  element: PickableElement,
  options: ElementStepOptions,
): { ops: { op: "add"; annotation: Annotation }[]; rectId: string } {
  const rectId = newAnnotationId(doc, "rect");
  const rect: Annotation = {
    id: rectId,
    type: "rect",
    ...elementBox(element.rect, doc.canvas, options.padding),
    ...(options.rectStyle === undefined ? {} : { style: options.rectStyle }),
  };
  const withRect = { ...doc, annotations: [...doc.annotations, rect] };
  const steps = completeSteps(withRect, {
    ids: [rectId],
    calloutText: options.calloutText,
    calloutStyle: options.calloutStyle,
    badgeStyle: options.badgeStyle,
  });
  return { ops: [{ op: "add", annotation: rect }, ...steps.ops], rectId };
}
