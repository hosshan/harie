import { describe, expect, it } from "vitest";
import { estimateImageScale, scaledDefaults } from "./scale";

describe("estimateImageScale（FR-EDIT-16）", () => {
  it("撮ったときの devicePixelRatio があれば、それを使う", () => {
    expect(estimateImageScale({ width: 800, height: 600 }, { devicePixelRatio: 2 })).toBe(2);
    expect(estimateImageScale({ width: 4000, height: 3000 }, { devicePixelRatio: 1 })).toBe(1);
    expect(estimateImageScale({ width: 800, height: 600 }, { devicePixelRatio: 1.25 })).toBe(1.5);
  });

  it("記録された dpi が 144 以上なら ÷72 を使い、72・96 は手がかりにしない", () => {
    expect(estimateImageScale({ width: 600, height: 400 }, { dpi: 144 })).toBe(2);
    expect(estimateImageScale({ width: 600, height: 400 }, { dpi: 216 })).toBe(3);
    expect(estimateImageScale({ width: 3000, height: 2000 }, { dpi: 72 })).toBe(2);
    expect(estimateImageScale({ width: 1200, height: 800 }, { dpi: 96 })).toBe(1);
  });

  it("手がかりがなければ、長い辺 ÷ 1440 を 0.5 刻みで切り捨てる（1〜4 倍）", () => {
    expect(estimateImageScale({ width: 1920, height: 1080 })).toBe(1);
    expect(estimateImageScale({ width: 2560, height: 1600 })).toBe(1.5);
    expect(estimateImageScale({ width: 2880, height: 1800 })).toBe(2);
    expect(estimateImageScale({ width: 1000, height: 3000 })).toBe(2);
    expect(estimateImageScale({ width: 400, height: 300 })).toBe(1);
    expect(estimateImageScale({ width: 20000, height: 100 })).toBe(4);
  });

  it("既定の線の太さ・文字サイズに倍率を掛ける", () => {
    expect(scaledDefaults(1)).toEqual({ strokeWidth: 4, fontSize: 24 });
    expect(scaledDefaults(1.5)).toEqual({ strokeWidth: 6, fontSize: 36 });
  });
});
