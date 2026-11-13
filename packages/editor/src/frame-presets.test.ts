import { describe, expect, it } from "vitest";
import { framePreset, matchFramePreset } from "./frame-presets";

describe("画像の仕上げの選択肢 FR-FILE-16", () => {
  it("なしは仕上げを外す", () => {
    expect(framePreset("none", 1)).toBeUndefined();
    expect(matchFramePreset(undefined, 1)).toBe("none");
  });
  it("画像の解像度に合わせて大きくする", () => {
    expect(framePreset("shadow", 2)).toMatchObject({ padding: 64, shadow: { blur: 48, y: 12 } });
    expect(framePreset("border", 2)).toMatchObject({ border: { width: 2 } });
  });
  it("余白の色に関わらず、同じ選択肢として見分ける。独自の値は null", () => {
    expect(matchFramePreset(framePreset("card", 2, "transparent"), 2)).toBe("card");
    expect(matchFramePreset(framePreset("shadow", 1), 1)).toBe("shadow");
    expect(matchFramePreset({ padding: 5 }, 1)).toBeNull();
    expect(matchFramePreset({ ...framePreset("shadow", 1), background: "#000000" }, 1)).toBeNull();
  });
});
