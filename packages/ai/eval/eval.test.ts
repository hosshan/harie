import { describe, expect, it } from "vitest";
import { matches, scorePii, scoreTargets } from "./score";
import { screens } from "./screens";

describe("評価セット", () => {
  it("合成画面は正しい注釈で描かれ、正解の範囲が画像の中にある", () => {
    for (const s of screens()) {
      expect(s.targets.length).toBeGreaterThan(0);
      for (const r of [...s.targets, ...s.pii.map((p) => p.rect)]) {
        expect(r.x + r.w).toBeLessThanOrEqual(s.doc.canvas.width);
        expect(r.y + r.h).toBeLessThanOrEqual(s.doc.canvas.height);
      }
    }
    // 個人情報が写っていない画面を 1 つ含める（適合率を測るため）
    expect(screens().some((s) => s.pii.length === 0)).toBe(true);
  });

  it("採点: 重なり・中心を含むものを当たりにする", () => {
    const truth = { x: 100, y: 100, w: 200, h: 20 };
    expect(matches({ x: 96, y: 96, w: 210, h: 28 }, truth)).toBe(true);
    expect(matches({ x: 150, y: 90, w: 40, h: 40 }, truth)).toBe(true);
    expect(matches({ x: 400, y: 100, w: 50, h: 20 }, truth)).toBe(false);
    expect(scorePii([truth, { x: 0, y: 0, w: 5, h: 5 }], [truth])).toEqual({
      truth: 1,
      found: 2,
      hit: 1,
      correct: 1,
    });
    expect(scoreTargets([], [truth])).toBe(false);
  });
});
