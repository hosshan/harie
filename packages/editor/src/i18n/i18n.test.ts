// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { detectLocale, getLocale, resetLocaleForTest, setLocale } from "./locale";
import { EDITOR_MESSAGES } from "./messages";
import { useLocale } from "./use-locale";

/** 文言の木から、文字列と（引数を入れて呼んだ）関数の結果をすべて集める */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const out = (value as (...args: unknown[]) => unknown)("x", "y", "z");
    return allStrings(out);
  }
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

const JAPANESE = /[ぁ-んァ-ヶ一-龯]/;

afterEach(() => {
  localStorage.clear();
  resetLocaleForTest();
});

describe("表示言語（NFR-I18N-01）", () => {
  it("ブラウザの言語が日本語なら日本語、それ以外は英語にする", () => {
    expect(detectLocale(["ja-JP", "en-US"])).toBe("ja");
    expect(detectLocale(["ja"])).toBe("ja");
    expect(detectLocale(["en-US", "ja"])).toBe("en");
    expect(detectLocale(["fr-FR"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });

  it("選んだ言語を記録し、読み直しても使う。<html lang> も合わせる", () => {
    setLocale("ja");
    expect(document.documentElement.lang).toBe("ja");
    resetLocaleForTest();
    expect(getLocale()).toBe("ja");
    setLocale("en");
    resetLocaleForTest();
    expect(getLocale()).toBe("en");
  });

  it("言語を変えると、使っている画面が描き直される", () => {
    setLocale("ja");
    const { result } = renderHook(() => useLocale());
    expect(result.current).toBe("ja");
    act(() => setLocale("en"));
    expect(result.current).toBe("en");
  });

  it("英語の文言に日本語が残っていない", () => {
    const leftovers = allStrings(EDITOR_MESSAGES.en).filter((s) => JAPANESE.test(s));
    expect(leftovers).toEqual([]);
  });
});
