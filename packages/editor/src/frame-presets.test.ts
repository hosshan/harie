import { describe, expect, it } from "vitest";
import { framePreset, matchFramePreset } from "./frame-presets";

describe("画像の仕上げの選択肢 FR-FILE-16", () => {
  it("なしは仕上げを外す", () => {
    expect(framePreset("none", 1)).toBeUndefined();
    expect(matchFramePreset(undefined, 1)).toBe("none");
  });
  it("影の余白は透明にし、画像の解像度に合わせて大きくする", () => {
    expect(framePreset("shadow", 2)).toMatchObject({
      padding: 64,
      background: "transparent",
      shadow: { blur: 48, y: 12 },
    });
    expect(framePreset("border", 2)).toMatchObject({ border: { width: 2 } });
  });
  it("選択肢と同じ値なら見分け、独自の値は null", () => {
    expect(matchFramePreset(framePreset("card", 2), 2)).toBe("card");
    expect(matchFramePreset(framePreset("shadow", 1), 1)).toBe("shadow");
    expect(matchFramePreset({ padding: 5 }, 1)).toBeNull();
  });
});
