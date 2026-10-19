// 表示言語（NFR-I18N-01）。日本語と英語。初めは利用者のブラウザ / OS の言語に合わせ、
// 設定で選んだ言語はこのブラウザの localStorage（`harie.locale`）に記録する。
// React に依存しない（Chrome 拡張のポップアップ・service worker からも使う）
export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const KEY = "harie.locale";

/** 言語の一覧（navigator.languages）から表示言語を決める。日本語が先頭なら日本語、それ以外は英語 */
export function detectLocale(languages: readonly string[]): Locale {
  const first = languages.find((l) => l !== "");
  return first?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language ?? ""];
}

/** 記録した言語。記録がない・読めないときは null */
export function loadStoredLocale(): Locale | null {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === "ja" || v === "en" ? v : null;
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
