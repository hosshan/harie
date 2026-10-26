// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。content script と service worker の両方から使う、DOM に依存しない部分
import type { HarieDocument } from "@harie/model";
// ページに入れるスクリプトを小さく保つため、zod を含まないファイル名の規則だけを読む
import { parseFileName } from "@harie/model/file-name";

/** GitHub で使うための権限（利用者がポップアップで有効にしたときだけ求める） */
export const GITHUB_ORIGINS = ["https://github.com/*", "https://*.githubusercontent.com/*"];
/** ほかのサイトでも使うための権限 */
export const ALL_SITES_ORIGINS = ["<all_urls>"];
/** permissions.getAll() が「全サイト」を返すときの書き方（Chrome の版によって違う） */
const ALL_SITES_ALIASES = ["<all_urls>", "*://*/*", "http://*/*", "https://*/*"];

/** 許可されているサイトのうち、ページ用のスクリプトを入れる先 */
export function pageScriptMatches(granted: readonly string[]): string[] {
  if (granted.some((o) => ALL_SITES_ALIASES.includes(o))) return [...ALL_SITES_ORIGINS];
  return GITHUB_ORIGINS.filter((o) => granted.includes(o));
}

function lastSegment(url: string): string | null {
  try {
    const u = new URL(url);
    const name = u.pathname.split("/").at(-1) ?? "";
    return name === "" ? null : decodeURIComponent(name);
  } catch {
    return null;
  }
}

/** ファイル名が Harie の規則（`<名前>.harie.<拡張子>`）に沿った画像の URL か。判定の本番は埋め込みデータ（ADR-0004） */
export function isHarieImageUrl(url: string): boolean {
  const name = lastSegment(url);
  return name !== null && parseFileName(name) !== null;
}

/** エディタで開くときのファイル名。URL の最後の部分、なければ既定の名前 */
export function fileNameFromUrl(url: string): string {
  const name = lastSegment(url);
  return name !== null && /\.(png|jpe?g)$/i.test(name) ? name : "image.png";
}

export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * 注釈ドキュメントを、ガイドの文章に貼りやすいテキストにする（「まとめてコピー」で使う）。
 * 番号の順に「番号. 吹き出しの文」を並べ、番号に紐付かない文字はそのあとに並べる
 */
export function annotationText(doc: HarieDocument): string {
  const lines: string[] = [];
  if (doc.meta.title) lines.push(doc.meta.title, "");
  const used = new Set<string>();
  // AI の提案中（未採用）の注釈は、画像に描かれていないので含めない
  const annotations = doc.annotations.filter((a) => a.status !== "suggested");
  const callouts = annotations.filter((a) => a.type === "callout");
  const badges = annotations.filter((a) => a.type === "badge").sort((a, b) => a.number - b.number);
  for (const badge of badges) {
    const target = badge.anchor?.annotationId;
    const texts = callouts
      .filter((c) => target !== undefined && c.anchor?.annotationId === target)
      .map((c) => {
        used.add(c.id);
        return c.text.trim();
      })
      .filter((t) => t !== "");
    lines.push(`${badge.number}. ${texts.join(" / ")}`.trimEnd());
  }
  for (const a of annotations) {
    if ((a.type === "callout" || a.type === "text") && !used.has(a.id) && a.text.trim() !== "") {
      lines.push(`- ${a.text.trim()}`);
    }
  }
  return lines.join("\n").trim();
}
