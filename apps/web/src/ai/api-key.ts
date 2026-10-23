// AI の接続情報（BYOK、architecture 4 章）。Anthropic の API キーか、OpenRouter で接続して発行したキー（ADR-0012）。
// このブラウザの localStorage にだけ置き、ファイル・ログ・URL には出さない（NFR-SEC-04）。登録できるのはどちらか 1 つ。
// 設定（ヘッダー）と AI のパネルで同じ値を使うため、ページの中で 1 つの値として持ち、変更を知らせる。
// OpenRouter の接続は別のウィンドウで終わるので、ほかのウィンドウでの変更（storage イベント）も受け取る
import { useSyncExternalStore } from "react";

export type AiProvider = "anthropic" | "openrouter";
export type AiCredential = { provider: AiProvider; key: string };

const KEYS: Record<AiProvider, string> = {
  anthropic: "harie.anthropicApiKey",
  openrouter: "harie.openrouterApiKey",
};

function read(provider: AiProvider): string | null {
  try {
    const v = localStorage.getItem(KEYS[provider]);
    return v === null || v === "" ? null : v;
  } catch {
    return null;
  }
}

export function loadCredential(): AiCredential | null {
  for (const provider of ["openrouter", "anthropic"] as const) {
    const key = read(provider);
    if (key !== null) return { provider, key };
  }
  return null;
}

let current: AiCredential | null | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** 接続情報を登録する（null で削除）。もう一方の接続先のキーは消す */
export function storeCredential(value: AiCredential | null): void {
  try {
    for (const provider of ["anthropic", "openrouter"] as const) {
      if (value?.provider === provider) localStorage.setItem(KEYS[provider], value.key);
      else localStorage.removeItem(KEYS[provider]);
    }
  } catch {
    // 保存できない環境（プライベートブラウズなど）では、このページを開いている間だけ使う
  }
  current = value;
  notify();
}

function snapshot(): AiCredential | null {
  if (current === undefined) current = loadCredential();
  return current;
}

function onStorage(e: StorageEvent): void {
  if (e.key !== null && !Object.values(KEYS).includes(e.key)) return;
  const next = loadCredential();
  // 同じ内容なら描き直さない（useSyncExternalStore は参照で比べる）
  if (next?.provider === current?.provider && next?.key === current?.key) return;
  current = next;
  notify();
}

/** 登録済みの接続情報（なければ null）。設定で登録・削除すると、使っている画面が描き直される */
export function useAiCredential(): AiCredential | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      if (listeners.size === 1) window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
    snapshot,
    () => null,
  );
}
