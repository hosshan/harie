import { describe, expect, it } from "vitest";
import {
  addPaletteColor,
  COLOR_PALETTE_KEY,
  COLOR_PALETTE_MAX,
  loadColorPalette,
  normalizeHex,
  removePaletteColor,
  saveColorPalette,
} from "./color-palette";

const memoryStore = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

describe("自分で作った色のパレット（FR-EDIT-17）", () => {
  it("カラーコードを #RRGGBB の大文字にそろえる", () => {
    expect(normalizeHex("#a1b2c3")).toBe("#A1B2C3");
    expect(normalizeHex(" a1b2c3 ")).toBe("#A1B2C3");
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("#12345")).toBeUndefined();
    expect(normalizeHex("red")).toBeUndefined();
  });

  it("足した色は先頭に入り、同じ色は重ねず、上限を超えた古い色は外す", () => {
    let colors: string[] = [];
    colors = addPaletteColor(colors, "#111111");
    colors = addPaletteColor(colors, "#222222");
    colors = addPaletteColor(colors, "#111111");
    expect(colors).toEqual(["#111111", "#222222"]);
    for (let i = 0; i < COLOR_PALETTE_MAX; i++) {
      colors = addPaletteColor(colors, `#0000${i.toString(16).padStart(2, "0")}`);
    }
    expect(colors).toHaveLength(COLOR_PALETTE_MAX);
    expect(colors).not.toContain("#222222");
    expect(addPaletteColor(colors, "nope")).toEqual(colors);
  });

  it("色を外せる", () => {
    expect(removePaletteColor(["#111111", "#222222"], "#111111")).toEqual(["#222222"]);
  });

  it("記録して読み直せる。壊れた値・色でない値は無視する", () => {
    const store = memoryStore();
    expect(loadColorPalette(store)).toEqual([]);
    saveColorPalette(["#A1B2C3", "#112233"], store);
    expect(loadColorPalette(store)).toEqual(["#A1B2C3", "#112233"]);
    store.setItem(COLOR_PALETTE_KEY, "{broken");
    expect(loadColorPalette(store)).toEqual([]);
    store.setItem(COLOR_PALETTE_KEY, JSON.stringify(["red"]));
    expect(loadColorPalette(store)).toEqual([]);
    store.setItem(COLOR_PALETTE_KEY, JSON.stringify(["#a1b2c3", "#A1B2C3"]));
    expect(loadColorPalette(store)).toEqual(["#A1B2C3"]);
  });

  it("記録できない環境でも例外にしない", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadColorPalette(broken)).toEqual([]);
    expect(() => saveColorPalette(["#111111"], broken)).not.toThrow();
  });
});
