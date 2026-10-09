// BYOK の API キー（architecture 4 章）。このブラウザの localStorage にだけ置き、ファイル・ログ・URL には出さない（NFR-SEC-04）
// 設定（ヘッダー）と AI のパネルで同じ値を使うため、ページの中で 1 つの値として持ち、変更を知らせる
import { useSyncExternalStore } from "react";

const KEY = "harie.anthropicApiKey";

export function loadApiKey(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null || v === "" ? null : v;
  } catch {
    return null;
  }
}

let current: string | null | undefined;
const listeners = new Set<() => void>();

export function storeApiKey(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    // 保存できない環境（プライベートブラウズなど）では、このページを開いている間だけ使う
  }
  current = value;
  for (const l of listeners) l();
}

function snapshot(): string | null {
  if (current === undefined) current = loadApiKey();
  return current;
}

/** 登録済みの API キー（なければ null）。設定で登録・削除すると、使っている画面が描き直される */
export function useApiKey(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    snapshot,
    () => null,
  );
}
