// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。content script と service worker の両方から使う、DOM に依存しない部分
import type { HarieDocument } from "@harie/model";
// ページに入れるスクリプトを小さく保つため、zod を含まないファイル名の規則だけを読む
import { parseFileName } from "@harie/model/file-name";

/**
 * ボタンを出すのに求める権限。画像は別のドメイン（CDN など）から来ることが多く、
 * service worker がそれを読むには全サイトの権限が要るので、ボタンを出すサイトを絞っても権限は全サイトで求める
 */
export const PAGE_ORIGINS = ["<all_urls>"];
/** permissions.getAll() が「全サイト」を返すときの書き方（Chrome の版によって違う） */
const ALL_SITES_ALIASES = ["<all_urls>", "*://*/*", "http://*/*", "https://*/*"];

/**
 * 入力されたサイトをドメインにそろえる（`https://github.com/foo` → `github.com`、`*.example.com` → `example.com`）。
 * ドメインとして使えなければ null
 */
export function normalizeSite(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (host === "") return null;
  // http(s) の URL ならドメインを取り出す。それ以外のスキーム（javascript: など）は受け付けない
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/.test(host) && !/^https?:\/\//.test(host)) return null;
  try {
    if (/^https?:\/\//.test(host)) host = new URL(host).hostname;
  } catch {
    return null;
  }
  host = host
    .replace(/^\*\./, "")
    .replace(/[/:?#].*$/, "")
    .replace(/\.$/, "");
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(
    host,
  )
    ? host
    : null;
}

/** ドメインと、そのサブドメインのページ */
function sitePatterns(site: string): string[] {
  const patterns = [`*://${site}/*`, `*://*.${site}/*`];
  // GitHub の差分の画像は、別ドメイン（viewscreen.githubusercontent.com）の iframe に出る
  if (site === "github.com") patterns.push("https://*.githubusercontent.com/*");
  return patterns;
}

/**
 * ページ用のスクリプトを入れる先。ボタンを 1 つも出さないか、権限がなければ入れない。
 * サイトの指定が空ならすべてのサイト、あればそのサイト（とサブドメイン）だけ
 */
export function pageScriptMatches(
  granted: readonly string[],
  settings: { edit: boolean; copy: boolean; sites: readonly string[] },
): string[] {
  if (!settings.edit && !settings.copy) return [];
  if (!granted.some((o) => ALL_SITES_ALIASES.includes(o))) return [];
  if (settings.sites.length === 0) return [...PAGE_ORIGINS];
  return [...new Set(settings.sites.flatMap(sitePatterns))];
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
