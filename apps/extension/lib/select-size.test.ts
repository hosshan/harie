import { describe, expect, it } from "vitest";
import { fixedRect, MAX_SELECT_SIDE, parseSelectSide } from "./selection";
import { fitImageRect } from "./snapshot";

const viewport = { width: 400, height: 300 };

describe("範囲の大きさを数値で決める（FR-CAP-10）", () => {
  it("FR-CAP-10: 1〜上限の整数だけを受け付ける", () => {
    expect(parseSelectSide(" 640 ")).toBe(640);
    for (const t of ["", "0", "-1", "1.5", "abc", String(MAX_SELECT_SIDE + 1)]) {
      expect(parseSelectSide(t)).toBeNull();
    }
  });

  it("FR-CAP-10: カーソルを左上にし、画像ピクセルを CSS ピクセルに直して置く", () => {
    expect(fixedRect({ x: 10, y: 20 }, { width: 200, height: 100 }, viewport, 2)).toEqual({
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    });
  });

  it("FR-CAP-10: はみ出す分は内側へ寄せ、画面より大きければ null", () => {
    expect(fixedRect({ x: 390, y: 290 }, { width: 100, height: 100 }, viewport, 1)).toEqual({
      x: 300,
      y: 200,
      w: 100,
      h: 100,
    });
    expect(fixedRect({ x: 0, y: 0 }, { width: 900, height: 100 }, viewport, 2)).toBeNull();
  });

  it("FR-CAP-10: 切り抜く範囲を、丸めでずれないよう指定の大きさちょうどにする", () => {
    const image = { width: 800, height: 600 };
    expect(
      fitImageRect({ x: 10, y: 10, w: 201, h: 99 }, { width: 200, height: 100 }, image),
    ).toEqual({ x: 10, y: 10, w: 200, h: 100 });
    expect(
      fitImageRect({ x: 790, y: 590, w: 10, h: 10 }, { width: 200, height: 100 }, image),
    ).toEqual({ x: 600, y: 500, w: 200, h: 100 });
  });
});
