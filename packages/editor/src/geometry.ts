// 注釈の移動・リサイズ。結果は applyOps の update 操作の patch として返す
import type { Annotation, Point } from "@harie/model";
import type { Bounds } from "@harie/render";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "from" | "to";

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
  return { x: round(a.x + dx), y: round(a.y + dy) };
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

const MIN_CALLOUT_WIDTH = 40;

/** ハンドルを p までドラッグしたときの patch */
export function resizePatch(a: Annotation, h: Handle, p: Point): Record<string, unknown> {
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
