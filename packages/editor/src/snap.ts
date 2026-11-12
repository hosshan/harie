// 動かす・描く・大きさを変えるときの吸着（スナップ）とガイド線（FR-EDIT-22）。
// 他の注釈と画像の端・中央に、左右の端と中央・上下の端と中央をそろえる。矢印の端は図形の中央と各辺の中点に吸い付く。
// 吸着は編集中の位置を決めるだけで、ドキュメントには何も残さない（矢印と図形の紐付けは持たない）
import type { HarieDocument, Point } from "@harie/model";
import { annotationBounds, type Bounds } from "@harie/render";

/** そろえ先の線。x は縦の線（左右の位置）、y は横の線（上下の位置） */
export type SnapLines = { x: readonly number[]; y: readonly number[] };

/** 表示するガイド線。axis が "x" なら x = at の縦の線、"y" なら y = at の横の線 */
export type Guide = { axis: "x" | "y"; at: number };

export type SnapResult = {
  /** 吸着した後の点（move では吸着した後の移動量の終点） */
  point: Point;
  guides: Guide[];
  /** 矢印の端が吸い付いた図形の点（中央・辺の中点） */
  anchor?: Point;
};

/**
 * 吸着の対象から外す注釈。動かしている注釈と、それに紐付いて一緒に動く番号（ADR-0011）。
 * 自分自身や一緒に動くものにそろえると、ドラッグ中に位置が定まらないため
 */
export function snapExclusions(doc: HarieDocument, ids: readonly string[]): Set<string> {
  const out = new Set(ids);
  for (const a of doc.annotations) {
    if (a.type === "badge" && a.anchor !== undefined && out.has(a.anchor.annotationId)) {
      out.add(a.id);
    }
  }
  return out;
}

/** 画像の端・中央と、外さない注釈の端・中央 */
export function snapLines(doc: HarieDocument, exclude: ReadonlySet<string> = new Set()): SnapLines {
  const { width, height } = doc.canvas;
  const x = [0, width / 2, width];
  const y = [0, height / 2, height];
  for (const a of doc.annotations) {
    if (exclude.has(a.id)) continue;
    const b = annotationBounds(a);
    x.push(b.x, b.x + b.w / 2, b.x + b.w);
    y.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { x, y };
}

/** 矢印の端が吸い付く点。矢印以外の注釈の中央と、上下左右の辺の中点 */
export function connectionPoints(
  doc: HarieDocument,
  exclude: ReadonlySet<string> = new Set(),
): Point[] {
  return doc.annotations.flatMap((a) => {
    if (a.type === "arrow" || exclude.has(a.id)) return [];
    const b = annotationBounds(a);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return [
      { x: cx, y: cy },
      { x: cx, y: b.y },
      { x: b.x + b.w, y: cy },
      { x: cx, y: b.y + b.h },
      { x: b.x, y: cy },
    ];
  });
}

/** values のどれかを targets のどれかにそろえるときの、最も小さいずれ（tolerance を超えれば undefined） */
function nearestOffset(
  values: readonly number[],
  targets: readonly number[],
  tolerance: number,
): { offset: number; at: number } | undefined {
  let best: { offset: number; at: number } | undefined;
  for (const v of values) {
    for (const t of targets) {
      const offset = t - v;
      if (Math.abs(offset) > tolerance) continue;
      if (best === undefined || Math.abs(offset) < Math.abs(best.offset)) best = { offset, at: t };
    }
  }
  return best;
}

/** 点を最寄りの線にそろえる（左右と上下は別々に）。描く・大きさを変えるときに使う */
export function snapPoint(p: Point, lines: SnapLines, tolerance: number): SnapResult {
  const sx = nearestOffset([p.x], lines.x, tolerance);
  const sy = nearestOffset([p.y], lines.y, tolerance);
  const guides: Guide[] = [];
  if (sx !== undefined) guides.push({ axis: "x", at: sx.at });
  if (sy !== undefined) guides.push({ axis: "y", at: sy.at });
  return { point: { x: p.x + (sx?.offset ?? 0), y: p.y + (sy?.offset ?? 0) }, guides };
}

/**
 * 動かす範囲（動かした後の位置）の左右の端・中央、上下の端・中央を最寄りの線にそろえるための追加の移動量
 */
export function snapBounds(
  b: Bounds,
  lines: SnapLines,
  tolerance: number,
): { dx: number; dy: number; guides: Guide[] } {
  const sx = nearestOffset([b.x, b.x + b.w / 2, b.x + b.w], lines.x, tolerance);
  const sy = nearestOffset([b.y, b.y + b.h / 2, b.y + b.h], lines.y, tolerance);
  const guides: Guide[] = [];
  if (sx !== undefined) guides.push({ axis: "x", at: sx.at });
  if (sy !== undefined) guides.push({ axis: "y", at: sy.at });
  return { dx: sx?.offset ?? 0, dy: sy?.offset ?? 0, guides };
}

/**
 * 矢印の端の吸着。近くに図形の中央・辺の中点があればそこへ吸い付き、なければ線にそろえる。
 * 吸い付く範囲は線にそろえる範囲より少し広い（anchorTolerance）
 */
export function snapArrowEnd(
  p: Point,
  points: readonly Point[],
  lines: SnapLines,
  tolerance: number,
  anchorTolerance: number = tolerance * 1.5,
): SnapResult {
  let best: Point | undefined;
  let bestDistance = anchorTolerance;
  for (const q of points) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestDistance) {
      best = q;
      bestDistance = d;
    }
  }
  if (best !== undefined) return { point: best, guides: [], anchor: best };
  return snapPoint(p, lines, tolerance);
}

/** 複数の範囲を囲む範囲 */
export function unionBounds(list: readonly Bounds[]): Bounds | undefined {
  if (list.length === 0) return undefined;
  const x0 = Math.min(...list.map((b) => b.x));
  const y0 = Math.min(...list.map((b) => b.y));
  const x1 = Math.max(...list.map((b) => b.x + b.w));
  const y1 = Math.max(...list.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 選んだ注釈をまとめて動かすときの吸着。start から current への移動量を、動かした範囲が線にそろうよう補正し、
 * 補正した後の current を返す
 */
export function snapMove(
  doc: HarieDocument,
  ids: readonly string[],
  start: Point,
  current: Point,
  tolerance: number,
): SnapResult {
  const exclude = snapExclusions(doc, ids);
  // 枠に付いていく番号は、そろえる範囲に含めない（枠の端・中央をそろえる）
  const selected = new Set(ids);
  const moving = unionBounds(
    doc.annotations
      .filter(
        (a) =>
          selected.has(a.id) &&
          !(a.type === "badge" && a.anchor !== undefined && selected.has(a.anchor.annotationId)),
      )
      .map((a) => annotationBounds(a)),
  );
  if (moving === undefined) return { point: current, guides: [] };
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const s = snapBounds(
    { ...moving, x: moving.x + dx, y: moving.y + dy },
    snapLines(doc, exclude),
    tolerance,
  );
  return { point: { x: current.x + s.dx, y: current.y + s.dy }, guides: s.guides };
}

/** 吸着を一時的に止める修飾キー（Mac は ⌘、ほかは Ctrl） */
export function snapDisabled(e: { metaKey: boolean; ctrlKey: boolean }, mac: boolean): boolean {
  return mac ? e.metaKey : e.ctrlKey;
}
