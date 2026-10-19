// 表示言語の React フック。設定で言語を変えると、使っている画面がすべて描き直される
import { useSyncExternalStore } from "react";
import { getLocale, type Locale, subscribeLocale } from "./locale";

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

/** 言語ごとの文言から、今の言語のものを返す */
export function useMessages<T>(catalog: Record<Locale, T>): T {
  return catalog[useLocale()];
}
