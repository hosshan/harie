import { describe, expect, it } from "vitest";
import { frameParts, toggleFramePart } from "./frame-parts";

describe("画像の仕上げの部品 FR-FILE-16", () => {
  it("何も付いていなければ、どの部品も外れている", () => {
    expect(frameParts(undefined)).toEqual({ border: false, shadow: false, radius: false });
  });
  it("影は透明の余白と一緒に付け、画像の解像度に合わせて大きくする", () => {
    expect(toggleFramePart(undefined, "shadow", 2)).toEqual({
      padding: 64,
      background: "transparent",
      shadow: { blur: 48, y: 12, color: "#00000033" },
    });
    expect(toggleFramePart(undefined, "border", 2)).toEqual({
      border: { width: 2, color: "#D4D4D8" },
    });
    expect(toggleFramePart(undefined, "radius", 1)).toEqual({ radius: 10 });
  });
  it("枠線・影・角丸を組み合わせられ、1 つずつ外せる", () => {
    let f = toggleFramePart(undefined, "border", 1);
    f = toggleFramePart(f, "shadow", 1);
    f = toggleFramePart(f, "radius", 1);
    expect(frameParts(f)).toEqual({ border: true, shadow: true, radius: true });
    f = toggleFramePart(f, "shadow", 1);
    expect(f).toEqual({ border: { width: 1, color: "#D4D4D8" }, radius: 10 });
    f = toggleFramePart(f, "border", 1);
    f = toggleFramePart(f, "radius", 1);
    expect(f).toBeUndefined();
  });
  it("独自の余白・背景は、影を付け外ししても残す", () => {
    const custom = { padding: 40, background: "#F4F4F5" };
    const withShadow = toggleFramePart(custom, "shadow", 1);
    expect(withShadow).toMatchObject({ padding: 40, background: "#F4F4F5" });
    expect(toggleFramePart(withShadow, "shadow", 1)).toEqual(custom);
  });
});
