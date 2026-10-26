// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。content script と service worker の両方から使う、DOM に依存しない部分
import type { HarieDocument } from "@harie/model";
// ページに入れるスクリプトを小さく保つため、zod を含まないファイル名の規則だけを読む
import { parseFileName } from "@harie/model/file-name";

/** GitHub で注釈データを出すための権限（利用者がポップアップで有効にしたときだけ求める） */
export const GITHUB_ORIGINS = ["https://github.com/*", "https://*.githubusercontent.com/*"];
/** ほかのサイトでも編集ボタンを出すための権限 */
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

/** 注釈データを返してよい組み合わせ。GitHub のページから、GitHub の画像を読むときだけ */
export function isGitHubImageRequest(senderUrl: string | undefined, imageUrl: string): boolean {
  try {
    if (senderUrl === undefined || new URL(senderUrl).hostname !== "github.com") return false;
    const u = new URL(imageUrl);
    return (
      u.protocol === "https:" &&
      (u.hostname === "github.com" || u.hostname.endsWith(".githubusercontent.com"))
    );
  } catch {
    return false;
  }
}

/**
 * GitHub のコミット・PR の差分で、画像の表示に使う iframe（viewscreen.githubusercontent.com）の URL から、
 * 表示している画像のファイル名と生データの URL を取り出す。`enc_url` は URL の文字列を 16 進にしたもの
 */
export function githubViewscreenImages(src: string): { path: string; urls: string[] } | null {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  if (u.hostname !== "viewscreen.githubusercontent.com") return null;
  const path = u.searchParams.get("path") ?? "";
  const urls: string[] = [];
  for (const [key, value] of u.searchParams) {
    if (!key.startsWith("enc_url") || !/^(?:[0-9a-f]{2})+$/i.test(value)) continue;
    const bytes = new Uint8Array(value.length / 2);
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
    const url = new TextDecoder().decode(bytes);
    if (isHttpUrl(url) && !urls.includes(url)) urls.push(url);
  }
  return urls.length === 0 ? null : { path, urls };
}

/**
 * 注釈ドキュメントを、ガイドの文章に貼りやすいテキストにする。
 * 番号の順に「番号. 吹き出しの文」を並べ、番号に紐付かない文字はそのあとに並べる
 */
export function annotationText(doc: HarieDocument): string {
  const lines: string[] = [];
  if (doc.meta.title) lines.push(doc.meta.title, "");
  const used = new Set<string>();
  const callouts = doc.annotations.filter((a) => a.type === "callout");
  const badges = doc.annotations
    .filter((a) => a.type === "badge")
    .sort((a, b) => a.number - b.number);
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
  for (const a of doc.annotations) {
    if ((a.type === "callout" || a.type === "text") && !used.has(a.id) && a.text.trim() !== "") {
      lines.push(`- ${a.text.trim()}`);
    }
  }
  return lines.join("\n").trim();
}
