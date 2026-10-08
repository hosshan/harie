// 評価の採点。位置の推定は文字の範囲と完全には一致しないので、IoU か「中心を含む」で当たりとする
import type { Rect } from "@harie/model";
import { iou } from "../src/geometry";

const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const contains = (r: Rect, p: { x: number; y: number }) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export function matches(found: Rect, truth: Rect): boolean {
  return (
    iou(found, truth) >= 0.3 || contains(found, center(truth)) || contains(truth, center(found))
  );
}

export type PiiScore = { truth: number; found: number; hit: number; correct: number };

/** hit: 見つかった正解の数（再現率の分子）、correct: 正解に当たった候補の数（適合率の分子） */
export function scorePii(found: readonly Rect[], truth: readonly Rect[]): PiiScore {
  return {
    truth: truth.length,
    found: found.length,
    hit: truth.filter((t) => found.some((f) => matches(f, t))).length,
    correct: found.filter((f) => truth.some((t) => matches(f, t))).length,
  };
}

/** 提案のどれかが、指してほしい要素のどれかに重なれば当たり */
export function scoreTargets(found: readonly Rect[], targets: readonly Rect[]): boolean {
  return targets.some((t) => found.some((f) => matches(f, t)));
}
