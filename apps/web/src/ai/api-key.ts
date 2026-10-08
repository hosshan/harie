// BYOK の API キー（architecture 4 章）。このブラウザの localStorage にだけ置き、ファイル・ログ・URL には出さない（NFR-SEC-04）
const KEY = "harie.anthropicApiKey";

export function loadApiKey(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null || v === "" ? null : v;
  } catch {
    return null;
  }
}

export function storeApiKey(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    // 保存できない環境（プライベートブラウズなど）では、このページを開いている間だけ使う
  }
}
