// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { markScrollbarKind, scrollbarKind } from "./scrollbars";

describe("スクロールバーの種類", () => {
  it("幅のないバーは内容に重なる（overlay）、幅のあるバーは場所を取る（classic）", () => {
    expect(scrollbarKind(0)).toBe("overlay");
    expect(scrollbarKind(15)).toBe("classic");
  });

  it("測った結果を <html> に印として付け、測るための箱は残さない", () => {
    // jsdom はレイアウトしないので幅は 0 になる
    expect(markScrollbarKind(document)).toBe("overlay");
    expect(document.documentElement.dataset.harieScrollbars).toBe("overlay");
    expect(document.body.children).toHaveLength(0);
  });
});
