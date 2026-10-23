import { describe, expect, it } from "vitest";
import { formatShortcut, isMacPlatform, matchesShortcut } from "./shortcuts";

const key = (
  k: string,
  mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean; code: string }> = {},
) => ({
  key: k,
  code: mods.code ?? "",
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
});

describe("キーボードのショートカット（FR-EDIT-12）", () => {
  it("Mac は ⌘、Windows は Ctrl で判定し、もう一方では当たらない", () => {
    expect(matchesShortcut(key("s", { meta: true }), "save", true)).toBe(true);
    expect(matchesShortcut(key("s", { ctrl: true }), "save", true)).toBe(false);
    expect(matchesShortcut(key("s", { ctrl: true }), "save", false)).toBe(true);
    expect(matchesShortcut(key("s", { meta: true }), "save", false)).toBe(false);
  });

  it("修飾キーは過不足なく一致したときだけ当たる", () => {
    expect(matchesShortcut(key("z", { ctrl: true }), "undo", false)).toBe(true);
    expect(matchesShortcut(key("Z", { ctrl: true, shift: true }), "undo", false)).toBe(false);
    expect(matchesShortcut(key("Z", { ctrl: true, shift: true }), "redo", false)).toBe(true);
    expect(matchesShortcut(key("y", { ctrl: true }), "redo", false)).toBe(true);
    expect(matchesShortcut(key("ArrowUp"), "nudge", false)).toBe(true);
    expect(matchesShortcut(key("ArrowUp", { shift: true }), "nudge", false)).toBe(false);
    expect(matchesShortcut(key("ArrowUp", { shift: true }), "nudgeLarge", false)).toBe(true);
    expect(matchesShortcut(key("ArrowRight", { ctrl: true }), "resize", false)).toBe(true);
    expect(matchesShortcut(key("ArrowRight", { ctrl: true }), "nudge", false)).toBe(false);
    expect(
      matchesShortcut(key("ArrowRight", { meta: true, shift: true }), "resizeLarge", true),
    ).toBe(true);
  });

  it("画像のコピー（FR-FILE-11）は ⌘⇧C で、注釈のコピー ⌘C と取り違えない", () => {
    expect(matchesShortcut(key("C", { meta: true, shift: true }), "copyImage", true)).toBe(true);
    expect(matchesShortcut(key("C", { meta: true, shift: true }), "copy", true)).toBe(false);
    expect(matchesShortcut(key("c", { ctrl: true }), "copyImage", false)).toBe(false);
  });

  it("記号のキーは位置（code）で判定する。? は Shift の有無を見ない", () => {
    const bracket = key("}", { meta: true, shift: true, code: "BracketRight" });
    expect(matchesShortcut(bracket, "bringToFront", true)).toBe(true);
    expect(matchesShortcut(bracket, "bringForward", true)).toBe(false);
    expect(matchesShortcut(key("?", { shift: true }), "shortcuts", false)).toBe(true);
  });

  it("表示は Mac が記号、ほかは Ctrl+Shift の表記", () => {
    expect(formatShortcut("redo", true)).toBe("⇧⌘Z");
    expect(formatShortcut("redo", false)).toBe("Ctrl+Shift+Z");
    expect(formatShortcut("bringForward", true)).toBe("⌘]");
    expect(formatShortcut("deselect", false)).toBe("Esc");
  });

  it("OS を判定する", () => {
    const nav = (platform: string) => ({ platform, userAgent: "" }) as Navigator;
    expect(isMacPlatform(nav("MacIntel"))).toBe(true);
    expect(isMacPlatform(nav("iPad"))).toBe(true);
    expect(isMacPlatform(nav("Win32"))).toBe(false);
    expect(isMacPlatform(nav("Linux x86_64"))).toBe(false);
  });
});
