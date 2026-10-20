// なぞった線から近い図形を読み取る（FR-EDIT-13）。読み取った図形は既存の注釈（四角・楕円・矢印・線）として追加し、
// 手描きの線そのものは残さない。どれにも当てはまらなければ null を返し、何も追加しない
import type { Point } from "@harie/model";

export type SketchShape =
  | { type: "rect" | "ellipse"; x: number; y: number; w: number; h: number }
  /** head: "none" は矢じりのない線 */
  | { type: "arrow"; from: Point; to: Point; head: "end" | "none" };

/** 等間隔に並べ直す点の数。描く速さで点の密度が変わっても、判定が偏らないようにする */
const SAMPLES = 64;
/** 始点と終点がこれより近ければ（外接矩形の対角線に対する比）、閉じた図形とみなす */
const CLOSED_GAP = 0.3;
/** 弦の長さ / 線の長さ がこれ以上なら、まっすぐな線とみなす */
const STRAIGHT = 0.93;
/** 輪郭からのずれ（短い辺に対する比の平均）がこれを超えたら、四角とも楕円ともみなさない */
const MAX_FIT_ERROR = 0.12;
/** 囲んだ面積 / 外接矩形の面積 がこれより小さければ、四角とも楕円ともみなさない */
const MIN_FILL = 0.66;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(points: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1] as Point, points[i] as Point);
  return len;
}

/** 線に沿って等間隔に n 点を取り直す */
export function resample(points: readonly Point[], n = SAMPLES): Point[] {
  const first = points[0];
  if (first === undefined) return [];
  const total = pathLength(points);
  if (total === 0) return [first];
  const step = total / (n - 1);
  const out: Point[] = [first];
  let prev = first;
  let carried = 0;
  for (let i = 1; i < points.length; i++) {
    const next = points[i] as Point;
    let seg = dist(prev, next);
    while (carried + seg >= step && out.length < n) {
      const t = (step - carried) / seg;
      const p = { x: prev.x + (next.x - prev.x) * t, y: prev.y + (next.y - prev.y) * t };
      out.push(p);
      prev = p;
      seg = dist(prev, next);
      carried = 0;
    }
    carried += seg;
    prev = next;
  }
  if (out.length < n) out.push(points[points.length - 1] as Point);
  return out;
}

function bounds(points: readonly Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function distanceToLine(p: Point, a: Point, b: Point): number {
  const len = dist(a, b);
  if (len === 0) return dist(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
}

/** 線で囲んだ面積（始点と終点を結んで閉じる）。向きによって符号が変わる */
function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Point;
    const b = points[(i + 1) % points.length] as Point;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

const round = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/**
 * 閉じた線を四角か楕円に当てはめる。外接矩形の辺までの距離と、外接矩形に内接する楕円までの距離を
 * それぞれ平均し、小さい方を選ぶ。どちらも大きい（三角・ひし形など）ときは null
 */
function fitClosed(points: readonly Point[]): SketchShape | null {
  const b = bounds(points);
  const short = Math.min(b.w, b.h);
  // 細すぎる閉じた線（行って戻っただけ）は図形にしない
  if (short < Math.max(b.w, b.h) * 0.08) return null;
  // 囲んだ面積が外接矩形に比べて小さい（三角・ひし形など）。四角はほぼ 1、楕円は π/4（約 0.79）
  if (Math.abs(polygonArea(points)) < b.w * b.h * MIN_FILL) return null;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = b.w / 2;
  const ry = b.h / 2;
  let rectError = 0;
  let ellipseError = 0;
  for (const p of points) {
    rectError += Math.min(
      Math.abs(p.x - b.x),
      Math.abs(b.x + b.w - p.x),
      Math.abs(p.y - b.y),
      Math.abs(b.y + b.h - p.y),
    );
    // 楕円の上の最も近い点の代わりに、中心から点へ向かう方向で楕円と交わる点を使う
    const dx = p.x - cx;
    const dy = p.y - cy;
    const r = Math.hypot(dx / rx, dy / ry);
    ellipseError += r === 0 ? Math.min(rx, ry) : Math.hypot(dx, dy) * Math.abs(1 - 1 / r);
  }
  rectError /= points.length * short;
  ellipseError /= points.length * short;
  if (Math.min(rectError, ellipseError) > MAX_FIT_ERROR) return null;
  const box = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
  return { type: rectError <= ellipseError ? "rect" : "ellipse", ...box };
}

/**
 * まっすぐな軸のあとで折り返す線を矢印とみなす（軸を描いてから、先端で「へ」の字やレの字に返す一筆書き）。
 * 先端は始点から最も遠い点（最初に着いたところ）。そこまでがまっすぐで、そのあとが先端の近くで始点の方へ戻っていれば矢印
 */
function fitArrow(points: readonly Point[]): SketchShape | null {
  const start = points[0] as Point;
  // 矢じりを描いて先端へ戻ると、同じくらい遠い点が 2 度現れる。最初に先端へ着いた点を使う
  const far = Math.max(...points.map((p) => dist(start, p)));
  let tipIndex = points.findIndex((p) => dist(start, p) >= far * 0.97);
  while (
    tipIndex + 1 < points.length &&
    dist(start, points[tipIndex + 1] as Point) > dist(start, points[tipIndex] as Point)
  ) {
    tipIndex++;
  }
  const tip = points[tipIndex] as Point;
  const shaft = dist(start, tip);
  const tail = points.slice(tipIndex + 1);
  if (shaft === 0 || tail.length < 2) return null;
  if (points.slice(1, tipIndex).some((p) => distanceToLine(p, start, tip) > shaft * 0.08)) {
    return null;
  }
  // 矢じりは軸より十分に短く、先端の近くにある
  const reach = Math.max(...tail.map((p) => dist(p, tip)));
  if (reach > shaft * 0.5 || reach < shaft * 0.08) return null;
  return { type: "arrow", from: round(start), to: round(tip), head: "end" };
}

/**
 * なぞった線（画像の座標）から図形を読み取る。`minSize` より小さい線（クリック・手ぶれ）は読み取らない
 */
export function recognizeSketch(points: readonly Point[], minSize = 8): SketchShape | null {
  if (points.length < 2) return null;
  const b = bounds(points);
  const diagonal = Math.hypot(b.w, b.h);
  if (diagonal < minSize) return null;
  const sampled = resample(points);
  const length = pathLength(sampled);
  const start = sampled[0] as Point;
  const end = sampled[sampled.length - 1] as Point;
  const chord = dist(start, end);
  if (chord / length >= STRAIGHT) {
    return { type: "arrow", from: round(start), to: round(end), head: "none" };
  }
  if (chord <= diagonal * CLOSED_GAP && length >= diagonal * 1.8) return fitClosed(sampled);
  return fitArrow(sampled);
}
