// 注釈の移動・リサイズ。結果は applyOps の update 操作の patch として返す
import {
  type Annotation,
  normalizeRotation,
  type Point,
  ROTATABLE_TYPES,
  rotationOf,
} from "@harie/model";
import { annotationBox, type Bounds, boxCenter, rotatePoint } from "@harie/render";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "from" | "to";

/** 回転のつまみ（FR-EDIT-21）。大きさを変えるつまみとは別に、選択枠の上に出す */
export const ROTATE_HANDLE = "rotate";

/** 回転のつまみを付ける注釈（ADR-0015） */
export function isRotatable(a: Annotation): boolean {
  return (ROTATABLE_TYPES as readonly string[]).includes(a.type);
}

/** 画像の座標の点を、注釈を回す前の座標に直す（回していなければそのまま） */
export function toLocal(a: Annotation, p: Point): Point {
  const deg = rotationOf(a);
  return deg === 0 ? p : rotatePoint(p, -deg, boxCenter(annotationBox(a)));
}

/** 点が注釈の範囲（回転を含む）の中にあるか */
export function hitsBox(a: Annotation, p: Point, margin = 0): boolean {
  return contains(annotationBox(a), toLocal(a, p), margin);
}

/** Shift を押しながら回したときに止まる角度の刻み */
export const ROTATION_STEP = 15;
/** 押さずに回したとき、0°・90° などの近くで吸い付く範囲（度） */
const ROTATION_SNAP = 3;

/**
 * 回転のつまみを p までドラッグしたときの patch。中心から p への向きが上になるよう回す。
 * `step` を渡すとその刻みに、渡さなければ 90° の倍数の近くでだけそろえる。0° は `rotation` を消す
 */
export function rotatePatch(a: Annotation, p: Point, step?: number): Record<string, unknown> {
  const c = boxCenter(annotationBox(a));
  if (p.x === c.x && p.y === c.y) return {};
  let deg = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
  if (step !== undefined && step > 0) deg = Math.round(deg / step) * step;
  else {
    const right = Math.round(deg / 90) * 90;
    deg = Math.abs(deg - right) <= ROTATION_SNAP ? right : Math.round(deg);
  }
  const r = normalizeRotation(deg);
  return { rotation: r === 0 ? undefined : r };
}

const round = (v: number) => Math.round(v);

/** 枠（x, y, w, h）を持つ注釈 */
export function isBoxed(a: Annotation): a is Extract<Annotation, { w: number; h: number }> {
  return a.type === "rect" || a.type === "ellipse" || a.type === "spotlight" || a.type === "blur";
}

/** 注釈ごとに使えるリサイズのハンドル */
export function handlesFor(a: Annotation): Handle[] {
  if (isBoxed(a)) return ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  if (a.type === "arrow") return ["from", "to"];
  if (a.type === "callout") return ["e", "w"];
  return [];
}

/** ハンドルの位置（arrow は端点、それ以外は選択枠の角・辺の中点） */
export function handlePosition(a: Annotation, b: Bounds, h: Handle): Point {
  if (a.type === "arrow") return h === "from" ? a.from : a.to;
  const x = h.includes("w") ? b.x : h.includes("e") ? b.x + b.w : b.x + b.w / 2;
  const y = h.includes("n") ? b.y : h.includes("s") ? b.y + b.h : b.y + b.h / 2;
  return { x, y };
}

export function movePatch(a: Annotation, dx: number, dy: number): Record<string, unknown> {
  if (a.type === "arrow") {
    return {
      from: { x: round(a.from.x + dx), y: round(a.from.y + dy) },
      to: { x: round(a.to.x + dx), y: round(a.to.y + dy) },
    };
  }
  const moved = { x: round(a.x + dx), y: round(a.y + dy) };
  // 紐付けた番号だけを動かしたら、紐付けを外して置いた位置に残す（ADR-0011）
  if (a.type === "badge" && a.anchor !== undefined) return { ...moved, anchor: undefined };
  return moved;
}

/** 2 点から正規化した枠（幅・高さが負にならない）を作る */
export function boxFrom(p: Point, q: Point): { x: number; y: number; w: number; h: number } {
  return {
    x: round(Math.min(p.x, q.x)),
    y: round(Math.min(p.y, q.y)),
    w: round(Math.abs(q.x - p.x)),
    h: round(Math.abs(q.y - p.y)),
  };
}

/** 吹き出しの最小の幅 */
export const MIN_CALLOUT_WIDTH = 40;

/** ドラッグするつまみの反対側（大きさを変えても動かさない点） */
const OPPOSITE: Partial<Record<Handle, Handle>> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

/**
 * ハンドルを p までドラッグしたときの patch。回していれば、回す前の座標でつまみを動かし、
 * 反対側の角・辺が画面上で動かないよう位置をずらす（ADR-0015）
 */
export function resizePatch(a: Annotation, h: Handle, p: Point): Record<string, unknown> {
  const deg = rotationOf(a);
  if (deg === 0 || a.type === "arrow") return resizeUnrotated(a, h, p);
  const patch = resizeUnrotated(a, h, toLocal(a, p));
  const fixed = a.type === "callout" ? (h === "e" ? "nw" : "ne") : OPPOSITE[h];
  if (fixed === undefined) return patch;
  const next = { ...a, ...patch } as Annotation;
  const before = annotationBox(a);
  const after = annotationBox(next);
  const g0 = rotatePoint(handlePosition(a, before, fixed), deg, boxCenter(before));
  const g1 = rotatePoint(handlePosition(next, after, fixed), deg, boxCenter(after));
  const nx = next as { x: number; y: number };
  return { ...patch, x: round(nx.x + g0.x - g1.x), y: round(nx.y + g0.y - g1.y) };
}

function resizeUnrotated(a: Annotation, h: Handle, p: Point): Record<string, unknown> {
  if (a.type === "arrow") {
    return h === "from"
      ? { from: { x: round(p.x), y: round(p.y) } }
      : { to: { x: round(p.x), y: round(p.y) } };
  }
  if (a.type === "callout") {
    const right = a.x + a.w;
    if (h === "e") return { w: round(Math.max(MIN_CALLOUT_WIDTH, p.x - a.x)) };
    const x = Math.min(p.x, right - MIN_CALLOUT_WIDTH);
    return { x: round(x), w: round(right - x) };
  }
  if (!isBoxed(a)) return {};
  // 動かさない側の角・辺を固定し、ドラッグした側だけ動かす
  const x0 = h.includes("w") ? p.x : a.x;
  const x1 = h.includes("e") ? p.x : a.x + a.w;
  const y0 = h.includes("n") ? p.y : a.y;
  const y1 = h.includes("s") ? p.y : a.y + a.h;
  return boxFrom({ x: x0, y: y0 }, { x: x1, y: y1 });
}

export function contains(b: Bounds, p: Point, margin = 0): boolean {
  return (
    p.x >= b.x - margin &&
    p.x <= b.x + b.w + margin &&
    p.y >= b.y - margin &&
    p.y <= b.y + b.h + margin
  );
}
