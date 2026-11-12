// 90° ずつの回転と、左右・上下の反転（FR-EDIT-22）。結果は applyOps の update 操作として返す
import { type Annotation, type HarieDocument, normalizeRotation, type Point } from "@harie/model";
import { annotationBounds, annotationBox, boxCenter, rotatePoint } from "@harie/render";
import { isBoxed, isRotatable } from "./geometry";

/** 90° 回す向き。cw は時計回り（右に回す）、ccw は反時計回り */
export type Turn = "ccw" | "cw";
/** 反転の向き。horizontal は左右、vertical は上下を入れ替える */
export type Flip = "horizontal" | "vertical";

export const TURNS: readonly Turn[] = ["ccw", "cw"];
export const FLIPS: readonly Flip[] = ["horizontal", "vertical"];

const round = (v: number) => Math.round(v);

/** 対象。枠に紐付けた番号は、枠も一緒に選んでいれば枠に付いていくので数えない（ADR-0011） */
function targets(doc: HarieDocument, ids: readonly string[]): Annotation[] {
  const selected = new Set(ids);
  return doc.annotations.filter(
    (a) =>
      selected.has(a.id) &&
      !(a.type === "badge" && a.anchor !== undefined && selected.has(a.anchor.annotationId)),
  );
}

/** 回す・反転する軸。1 つならその注釈の中心、2 つ以上なら選んだ注釈全体を囲む範囲の中心 */
function pivot(list: readonly Annotation[]): Point {
  const bounds = list.map((a) => annotationBounds(a));
  const x0 = Math.min(...bounds.map((b) => b.x));
  const y0 = Math.min(...bounds.map((b) => b.y));
  const x1 = Math.max(...bounds.map((b) => b.x + b.w));
  const y1 = Math.max(...bounds.map((b) => b.y + b.h));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

/** 範囲の中心が `to` に来るよう動かす patch（w, h は next の値で測る） */
function centerAt(
  a: Annotation,
  next: Record<string, unknown>,
  to: Point,
): Record<string, unknown> {
  const c = boxCenter(annotationBox({ ...a, ...next } as Annotation));
  const p = a as unknown as { x: number; y: number };
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  const moved = { x: round(p.x + dx), y: round(p.y + dy) };
  // 紐付けた番号だけを動かしたら、紐付けを外して置いた位置に残す（ADR-0011）
  if (a.type === "badge" && a.anchor !== undefined) return { ...next, ...moved, anchor: undefined };
  return { ...next, ...moved };
}

function opsOf(list: readonly Annotation[], patch: (a: Annotation) => Record<string, unknown>) {
  return list.flatMap((a) => {
    const p = patch(a);
    const current = a as Record<string, unknown>;
    const same = Object.entries(p).every(
      ([k, v]) => JSON.stringify(current[k]) === JSON.stringify(v),
    );
    return same ? [] : [{ op: "update", id: a.id, patch: p }];
  });
}

const rotationPatch = (deg: number) => {
  const r = normalizeRotation(deg);
  return { rotation: r === 0 ? undefined : r };
};

/**
 * 選んだ注釈を 90° 回す操作。2 つ以上なら全体の中心を軸に位置も回す。
 * 四角・楕円・スポットライト・ぼかしは幅と高さを入れ替える（回したのと同じ見た目で、`rotation` を増やさない）。
 * テキスト・吹き出しは `rotation` を 90° 足す。矢印は端点を回す。番号は位置だけ動かす
 */
export function turnOps(doc: HarieDocument, ids: readonly string[], turn: Turn): unknown[] {
  const list = targets(doc, ids);
  if (list.length === 0) return [];
  const c = pivot(list);
  const deg = turn === "cw" ? 90 : -90;
  const turnPoint = (p: Point) => {
    const q = rotatePoint(p, deg, c);
    return { x: round(q.x), y: round(q.y) };
  };
  return opsOf(list, (a) => {
    if (a.type === "arrow") return { from: turnPoint(a.from), to: turnPoint(a.to) };
    const to = rotatePoint(boxCenter(annotationBox(a)), deg, c);
    if (isBoxed(a)) return centerAt(a, { w: a.h, h: a.w }, to);
    if (isRotatable(a))
      return centerAt(a, rotationPatch(((a as { rotation?: number }).rotation ?? 0) + deg), to);
    return centerAt(a, {}, to);
  });
}

/**
 * 選んだ注釈を左右・上下に反転する操作。2 つ以上なら全体の中心を軸に位置を入れ替える。
 * 回している注釈は角度の向きを逆にし、矢印は端点を入れ替える。文字そのものは鏡に映さない（読めなくなるため）
 */
export function flipOps(doc: HarieDocument, ids: readonly string[], flip: Flip): unknown[] {
  const list = targets(doc, ids);
  if (list.length === 0) return [];
  const c = pivot(list);
  const mirror = (p: Point): Point =>
    flip === "horizontal" ? { x: 2 * c.x - p.x, y: p.y } : { x: p.x, y: 2 * c.y - p.y };
  const mirrorPoint = (p: Point) => {
    const q = mirror(p);
    return { x: round(q.x), y: round(q.y) };
  };
  return opsOf(list, (a) => {
    if (a.type === "arrow") return { from: mirrorPoint(a.from), to: mirrorPoint(a.to) };
    const to = mirror(boxCenter(annotationBox(a)));
    const rotation = isRotatable(a) ? (a as { rotation?: number }).rotation : undefined;
    return centerAt(a, rotation === undefined ? {} : rotationPatch(-rotation), to);
  });
}
