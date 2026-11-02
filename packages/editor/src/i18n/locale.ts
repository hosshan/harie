// 表示言語（NFR-I18N-01）。日本語・英語・韓国語・繁體中文・简体中文・スペイン語・ポルトガル語（ブラジル）。
// 初めは利用者のブラウザ / OS の言語に合わせ、
// 設定で選んだ言語はこのブラウザの localStorage（`harie.locale`）に記録する。
// React に依存しない（Chrome 拡張のポップアップ・service worker からも使う）
export const LOCALES = ["ja", "en", "ko", "zh-TW", "zh-CN", "es", "pt-BR"] as const;
export type Locale = (typeof LOCALES)[number];

/** 言語の名前。その言語自身で書く（今の表示言語が読めない人でも選べるように） */
export const LOCALE_NAMES: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  ko: "한국어",
  "zh-TW": "繁體中文",
  "zh-CN": "简体中文",
  es: "Español",
  "pt-BR": "Português (Brasil)",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** 言語タグ（BCP 47）1 つを表示言語に。対応していなければ null */
function toLocale(tag: string): Locale | null {
  const t = tag.toLowerCase();
  const [lang, ...rest] = t.split("-");
  switch (lang) {
    case "ja":
      return "ja";
    case "en":
      return "en";
    case "ko":
      return "ko";
    case "es":
      return "es";
    // ポルトガル語はブラジルの言い方で出す（ポルトガル本国も同じ文言を使う）
    case "pt":
      return "pt-BR";
    case "zh":
      // 繁体字: zh-Hant・台湾・香港・マカオ。それ以外（zh・zh-CN・zh-Hans・シンガポール）は簡体字
      return rest.some((p) => p === "hant" || p === "tw" || p === "hk" || p === "mo")
        ? "zh-TW"
        : "zh-CN";
    default:
      return null;
  }
}

const KEY = "harie.locale";

/** 言語の一覧（navigator.languages）から表示言語を決める。先頭の言語に対応していればそれ、なければ英語 */
export function detectLocale(languages: readonly string[]): Locale {
  const first = languages.find((l) => l !== "");
  return (first === undefined ? null : toLocale(first)) ?? "en";
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language ?? ""];
}

/** 記録した言語。記録がない・読めないときは null */
export function loadStoredLocale(): Locale | null {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

let current: Locale | undefined;
const listeners = new Set<() => void>();

/** 今の表示言語。記録があればそれ、なければブラウザの言語から決める */
export function getLocale(): Locale {
  if (current === undefined) current = loadStoredLocale() ?? detectLocale(browserLanguages());
  return current;
}

/** 表示言語を変えて記録する。使っている画面は描き直される */
export function setLocale(locale: Locale): void {
  try {
    globalThis.localStorage?.setItem(KEY, locale);
  } catch {
    // 記録できない環境（プライベートブラウズなど）では、このページを開いている間だけ使う
  }
  current = locale;
  applyDocumentLang(locale);
  for (const l of listeners) l();
}

export function subscribeLocale(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** <html lang> を表示言語に合わせる（読み上げ・フォントの選択に使われる） */
export function applyDocumentLang(locale: Locale = getLocale()): void {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

/**
 * 文言の型。日本語の文言（`as const` の定数）から、文字列と関数の形だけを残した型を作る。
 * 英語の文言をこの型にすると、項目の抜け・引数の違いを型検査で見つけられる
 */
export type Messages<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Messages<R>
    : { [K in keyof T]: Messages<T[K]> };

/** テスト用: 記録を読み直させる */
export function resetLocaleForTest(locale?: Locale): void {
  current = locale;
}
