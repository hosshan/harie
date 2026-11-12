// 複数の注釈の選択と、まとめての移動（FR-EDIT-11）。結果は applyOps の操作として返す
import {
  type Annotation,
  type HarieDocument,
  type Point,
  type Rect,
  rotationOf,
} from "@harie/model";
import { annotationBounds, annotationBox, type Bounds, boxCenter } from "@harie/render";
import { isBoxed, MIN_CALLOUT_WIDTH, movePatch } from "./geometry";

/** Shift を押してクリックしたとき。選んでいなければ加え、選んでいれば外す */
export function toggleSelection(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** 範囲（ドラッグした四角）に少しでも重なる注釈。描いた順に返す */
export function annotationsInRect(doc: HarieDocument, r: Rect): string[] {
  return doc.annotations
    .filter((a) => {
      const b = annotationBounds(a);
      return b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y;
    })
    .map((a) => a.id);
}

/** すでに選んでいるものに、範囲で選んだものを足す（並びは先に選んだものから） */
export function mergeSelection(base: readonly string[], added: readonly string[]): string[] {
  return [...base, ...added.filter((id) => !base.includes(id))];
}

/**
 * 選んだ注釈をまとめて動かす操作（ドラッグ 1 回で 1 つの操作）。枠に紐付けた番号は、枠も一緒に選んでいれば
 * 紐付けたまま枠に付いていく（番号だけを動かしたときは紐付けを外す。ADR-0011）
 */
export function moveOps(
  doc: HarieDocument,
  ids: readonly string[],
  dx: number,
  dy: number,
): unknown[] {
  if (dx === 0 && dy === 0) return [];
  const selected = new Set(ids);
  return doc.annotations
    .filter((a) => selected.has(a.id) && !followsSelectedBox(a, selected))
    .map((a) => ({ op: "update", id: a.id, patch: movePatch(a, dx, dy) }));
}

function followsSelectedBox(a: Annotation, selected: ReadonlySet<string>): boolean {
  return a.type === "badge" && a.anchor !== undefined && selected.has(a.anchor.annotationId);
}

/**
 * 選んだ枠の大きさをキーで変える操作（FR-EDIT-12）。左上を固定して幅・高さを足し引きする。
 * 大きさを持たない注釈（矢印・テキスト・番号）は変えない。吹き出しは幅だけ変える
 */
export function resizeOps(
  doc: HarieDocument,
  ids: readonly string[],
  dw: number,
  dh: number,
): unknown[] {
  const selected = new Set(ids);
  return doc.annotations.flatMap((a) => {
    if (!selected.has(a.id)) return [];
    let patch: Record<string, number> | undefined;
    if (isBoxed(a)) patch = { w: Math.max(1, a.w + dw), h: Math.max(1, a.h + dh) };
    else if (a.type === "callout") patch = { w: Math.max(MIN_CALLOUT_WIDTH, a.w + dw) };
    const current: Record<string, unknown> = a;
    if (patch === undefined || Object.entries(patch).every(([k, v]) => current[k] === v)) return [];
    return [{ op: "update", id: a.id, patch }];
  });
}

/** 選んだ注釈をすべて囲む枠。選んでいなければ undefined */
export function selectionBounds(doc: HarieDocument, ids: readonly string[]): Bounds | undefined {
  const boxes = doc.annotations.filter((a) => ids.includes(a.id)).map((a) => annotationBounds(a));
  if (boxes.length === 0) return undefined;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * 選んだ注釈を、囲む枠 from が to になるよう比例して拡大・縮小する操作（FR-EDIT-11）。
 * 枠・楕円は位置と大きさ、矢印は両端、吹き出しは位置と幅を変える。テキスト・番号は位置（左上）だけを
 * 動かす。線の太さと文字の大きさは変えない。枠も一緒に選んだ紐付けた番号は、枠に付いていく（ADR-0011）
 */
export function scaleOps(
  doc: HarieDocument,
  ids: readonly string[],
  from: Bounds,
  to: Bounds,
): unknown[] {
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  if (sx === 1 && sy === 1 && to.x === from.x && to.y === from.y) return [];
  const round = (v: number) => Math.round(v);
  const map = (p: Point): Point => ({
    x: round(to.x + (p.x - from.x) * sx),
    y: round(to.y + (p.y - from.y) * sy),
  });
  const selected = new Set(ids);
  return doc.annotations.flatMap((a) => {
    if (!selected.has(a.id) || followsSelectedBox(a, selected)) return [];
    let patch: Record<string, unknown>;
    if (rotationOf(a) !== 0) {
      // 回した注釈（ADR-0015）は中心を写し、幅・高さを倍率で掛けて、角度はそのまま保つ
      const size: Record<string, number> = isBoxed(a)
        ? { w: Math.max(1, round(a.w * sx)), h: Math.max(1, round(a.h * sy)) }
        : a.type === "callout"
          ? { w: Math.max(MIN_CALLOUT_WIDTH, round(a.w * sx)) }
          : {};
      const c = boxCenter(annotationBox(a));
      const moved = { x: to.x + (c.x - from.x) * sx, y: to.y + (c.y - from.y) * sy };
      const next = boxCenter(annotationBox({ ...a, ...size } as Annotation));
      const at = a as { x: number; y: number };
      patch = { ...size, x: round(at.x + moved.x - next.x), y: round(at.y + moved.y - next.y) };
    } else if (a.type === "arrow") patch = { from: map(a.from), to: map(a.to) };
    else if (isBoxed(a)) {
      // 端を写してから幅・高さを出す（丸めで隣り合う枠の間がずれないように）
      const p = map(a);
      const q = map({ x: a.x + a.w, y: a.y + a.h });
      patch = { ...p, w: Math.max(1, q.x - p.x), h: Math.max(1, q.y - p.y) };
    } else if (a.type === "callout") {
      patch = { ...map(a), w: Math.max(MIN_CALLOUT_WIDTH, round(a.w * sx)) };
    } else {
      patch = map(a);
      // 紐付けた番号だけを動かすときと同じく、紐付けを外して置いた位置に残す
      if (a.type === "badge" && a.anchor !== undefined) patch.anchor = undefined;
    }
    const current: Record<string, unknown> = a;
    const same = Object.entries(patch).every(([k, v]) =>
      typeof v === "object" && v !== null
        ? JSON.stringify(v) === JSON.stringify(current[k])
        : current[k] === v,
    );
    return same ? [] : [{ op: "update", id: a.id, patch }];
  });
}

/** 選んだ注釈をまとめて消す操作 */
export function removeOps(ids: readonly string[]): unknown[] {
  return ids.map((id) => ({ op: "remove", id }));
}

/** 重なりの順の変え方（FR-EDIT-12）。forward / backward は 1 つずつ、front / back はいちばん上・下へ */
export type Reorder = "forward" | "backward" | "front" | "back";

/** 選んだ注釈の重なりの順を変える操作。選んだもの同士の順は保つ。変わらなければ空 */
export function reorderOps(doc: HarieDocument, ids: readonly string[], how: Reorder): unknown[] {
  const selected = new Set(ids);
  const order = doc.annotations.map((a) => a.id);
  let next: string[];
  if (how === "front" || how === "back") {
    const picked = order.filter((id) => selected.has(id));
    const rest = order.filter((id) => !selected.has(id));
    next = how === "front" ? [...rest, ...picked] : [...picked, ...rest];
  } else {
    next = [...order];
    // 動かす向きの端から順に、選んでいない隣と入れ替える（選んだもの同士は追い越さない）
    const indexes = next.map((_, i) => i);
    for (const i of how === "forward" ? indexes.reverse() : indexes) {
      const j = how === "forward" ? i + 1 : i - 1;
      const [a, b] = [next[i], next[j]];
      if (a === undefined || b === undefined || !selected.has(a) || selected.has(b)) continue;
      next[i] = b;
      next[j] = a;
    }
  }
  if (next.every((id, i) => id === order[i])) return [];
  return next.map((id, index) => ({ op: "reorder", id, index }));
}

/** 貼り付け・複製でずらす量（画像のピクセル） */
export const PASTE_OFFSET = 16;

/**
 * 注釈を貼り付ける（複製する）操作と、貼り付けた注釈の ID。新しい ID を振り、少しずらして上に重ねる。
 * 紐付け（番号の枠・吹き出しの矢印の先）は、紐付け先も一緒に貼るときだけ新しい ID に付け替え、ほかは外す
 */
export function pasteOps(
  doc: HarieDocument,
  annotations: readonly Annotation[],
  dx = PASTE_OFFSET,
  dy = dx,
): { ops: unknown[]; ids: string[] } {
  const taken = new Set(doc.annotations.map((a) => a.id));
  const renamed = new Map<string, string>();
  for (const a of annotations) {
    let n = 1;
    const prefix = a.id.replace(/-\d+$/, "");
    while (taken.has(`${prefix}-${n}`)) n++;
    taken.add(`${prefix}-${n}`);
    renamed.set(a.id, `${prefix}-${n}`);
  }
  const ops = annotations.map((a) => {
    const copy: Record<string, unknown> = {
      ...a,
      ...movePatch(a, dx, dy),
      id: renamed.get(a.id) ?? a.id,
    };
    const anchor = a.type === "badge" || a.type === "callout" ? a.anchor : undefined;
    const target = anchor === undefined ? undefined : renamed.get(anchor.annotationId);
    if (anchor === undefined || target === undefined) delete copy.anchor;
    else copy.anchor = { ...anchor, annotationId: target };
    return { op: "add", annotation: copy };
  });
  return { ops, ids: [...renamed.values()] };
}

/**
 * Alt（Option）を押しながらドラッグしたとき、選んだ注釈を複製して (dx, dy) だけずらした所に置く操作と、
 * 複製した注釈の ID（FR-EDIT-12）。元の注釈は動かさない。重なりは元の並びのまま、いちばん上に重ねる
 */
export function duplicateOps(
  doc: HarieDocument,
  ids: readonly string[],
  dx: number,
  dy: number,
): { ops: unknown[]; ids: string[] } {
  const selected = new Set(ids);
  const picked = doc.annotations.filter((a) => selected.has(a.id));
  if (picked.length === 0) return { ops: [], ids: [] };
  return pasteOps(doc, picked, dx, dy);
}
