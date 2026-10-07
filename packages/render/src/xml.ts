// SVG 文字列を組み立てる小さな補助。出力を安定させるため、数値の書き方をここで統一する
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 数値を SVG に書く。小数は 2 桁に丸め、出力を安定させる（スナップショット・決定性のため）。 */
export function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

export function attrs(a: Record<string, string | number | undefined>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${typeof v === "number" ? n(v) : esc(v as string)}"`)
    .join(" ");
}
