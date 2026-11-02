// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { detectLocale, getLocale, LOCALES, resetLocaleForTest, setLocale } from "./locale";
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
/** ひらがな・カタカナ（中国語の文言は漢字を使うので、訳し漏れはかなで見つける） */
const KANA = /[ぁ-んァ-ヶ]/;

afterEach(() => {
  localStorage.clear();
  resetLocaleForTest();
});

describe("表示言語（NFR-I18N-01）", () => {
  it("ブラウザの先頭の言語に対応していればそれ、それ以外は英語にする", () => {
    expect(detectLocale(["ja-JP", "en-US"])).toBe("ja");
    expect(detectLocale(["ja"])).toBe("ja");
    expect(detectLocale(["en-US", "ja"])).toBe("en");
    expect(detectLocale(["fr-FR"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });

  it("韓国語・中国語（繁体字 / 簡体字）・スペイン語・ポルトガル語を言語タグから選ぶ", () => {
    expect(detectLocale(["ko-KR"])).toBe("ko");
    expect(detectLocale(["zh-TW"])).toBe("zh-TW");
    expect(detectLocale(["zh-HK"])).toBe("zh-TW");
    expect(detectLocale(["zh-Hant-TW"])).toBe("zh-TW");
    expect(detectLocale(["zh-CN"])).toBe("zh-CN");
    expect(detectLocale(["zh"])).toBe("zh-CN");
    expect(detectLocale(["zh-Hans-SG"])).toBe("zh-CN");
    expect(detectLocale(["es-MX"])).toBe("es");
    expect(detectLocale(["pt-BR"])).toBe("pt-BR");
    expect(detectLocale(["pt-PT"])).toBe("pt-BR");
  });

  it("記録した言語が対応外の値なら、ブラウザの言語に戻る", () => {
    localStorage.setItem("harie.locale", "fr");
    resetLocaleForTest();
    expect(LOCALES).toContain(getLocale());
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

  it.each(["ko", "zh-TW", "zh-CN", "es", "pt-BR"] as const)(
    "%s の文言にかなが残っていない",
    (locale) => {
      const leftovers = allStrings(EDITOR_MESSAGES[locale]).filter((s) => KANA.test(s));
      expect(leftovers).toEqual([]);
    },
  );
});
