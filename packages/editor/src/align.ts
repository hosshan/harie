// 選んだ注釈の整列と等間隔の分布（FR-EDIT-20）。結果は applyOps の update 操作として返す
import type { Annotation, HarieDocument } from "@harie/model";
import { annotationBounds, type Bounds } from "@harie/render";
import { movePatch } from "./geometry";

/** 揃え方。left / hcenter / right は横、top / vcenter / bottom は縦の位置を揃える */
export type Alignment = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
/** 等間隔に並べる向き。horizontal は横に、vertical は縦に並べる */
export type Distribution = "horizontal" | "vertical";

export const ALIGNMENTS: readonly Alignment[] = [
  "left",
  "hcenter",
  "right",
  "top",
  "vcenter",
  "bottom",
];
export const DISTRIBUTIONS: readonly Distribution[] = ["horizontal", "vertical"];

interface Item {
  annotation: Annotation;
  bounds: Bounds;
}

/**
 * 動かす対象。枠に紐付けた番号は、枠も一緒に選んでいれば枠に付いていくので数えない（ADR-0011）
 */
function items(doc: HarieDocument, ids: readonly string[]): Item[] {
  const selected = new Set(ids);
  return doc.annotations
    .filter(
      (a) =>
        selected.has(a.id) &&
        !(a.type === "badge" && a.anchor !== undefined && selected.has(a.anchor.annotationId)),
    )
    .map((a) => ({ annotation: a, bounds: annotationBounds(a) }));
}

/** 揃える基準。2 つ以上なら選んだ注釈全体を囲む範囲、1 つなら画像 */
function reference(doc: HarieDocument, list: readonly Item[]): Bounds {
  if (list.length === 1) return { x: 0, y: 0, w: doc.canvas.width, h: doc.canvas.height };
  const x0 = Math.min(...list.map((i) => i.bounds.x));
  const y0 = Math.min(...list.map((i) => i.bounds.y));
  const x1 = Math.max(...list.map((i) => i.bounds.x + i.bounds.w));
  const y1 = Math.max(...list.map((i) => i.bounds.y + i.bounds.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function moveOp(item: Item, dx: number, dy: number): unknown[] {
  const rx = Math.round(dx);
  const ry = Math.round(dy);
  if (rx === 0 && ry === 0) return [];
  return [{ op: "update", id: item.annotation.id, patch: movePatch(item.annotation, rx, ry) }];
}

/** 等間隔に並べられるか（3 つ以上選んでいる） */
export function canDistribute(doc: HarieDocument, ids: readonly string[]): boolean {
  return items(doc, ids).length >= 3;
}

/** 揃えるために動かす量 */
function alignDelta(r: Bounds, b: Bounds, how: Alignment): [number, number] {
  switch (how) {
    case "left":
      return [r.x - b.x, 0];
    case "hcenter":
      return [r.x + r.w / 2 - (b.x + b.w / 2), 0];
    case "right":
      return [r.x + r.w - (b.x + b.w), 0];
    case "top":
      return [0, r.y - b.y];
    case "vcenter":
      return [0, r.y + r.h / 2 - (b.y + b.h / 2)];
    case "bottom":
      return [0, r.y + r.h - (b.y + b.h)];
  }
}

/** 選んだ注釈の位置を揃える操作。1 つだけなら画像に対して揃える。変わらなければ空 */
export function alignOps(doc: HarieDocument, ids: readonly string[], how: Alignment): unknown[] {
  const list = items(doc, ids);
  if (list.length === 0) return [];
  const r = reference(doc, list);
  return list.flatMap((item) => {
    const [dx, dy] = alignDelta(r, item.bounds, how);
    return moveOp(item, dx, dy);
  });
}

/**
 * 選んだ注釈の間隔を揃える操作。中心の並びの両端にあるものは動かさず、間のものを動かして
 * 隣どうしのすき間を等しくする。3 つ未満なら空
 */
export function distributeOps(
  doc: HarieDocument,
  ids: readonly string[],
  how: Distribution,
): unknown[] {
  const list = items(doc, ids);
  if (list.length < 3) return [];
  const horizontal = how === "horizontal";
  const start = (b: Bounds) => (horizontal ? b.x : b.y);
  const size = (b: Bounds) => (horizontal ? b.w : b.h);
  const sorted = [...list].sort(
    (a, b) => start(a.bounds) + size(a.bounds) / 2 - (start(b.bounds) + size(b.bounds) / 2),
  );
  const first = sorted[0] as Item;
  const last = sorted[sorted.length - 1] as Item;
  const span = start(last.bounds) + size(last.bounds) - start(first.bounds);
  const total = sorted.reduce((sum, i) => sum + size(i.bounds), 0);
  const gap = (span - total) / (sorted.length - 1);
  let cursor = start(first.bounds);
  return sorted.flatMap((item, index) => {
    const target = cursor;
    cursor += size(item.bounds) + gap;
    if (index === 0 || index === sorted.length - 1) return [];
    const d = target - start(item.bounds);
    return horizontal ? moveOp(item, d, 0) : moveOp(item, 0, d);
  });
}
