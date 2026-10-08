// 保存ファイル名の規則（ADR-0006, FR-FILE-06）
// 形式: <名前>.<プロダクト名マーカー>.<拡張子>  例: notification-settings.harie.jpg

/**
 * プロダクト名マーカー。名称を変えるときはこの値だけを変え、旧値は LEGACY_MARKERS に移す。
 * ファイル形式内の識別子（XMP 名前空間・JUMBF ラベル）とは独立しており、そちらは変えない。
 */
export const PRODUCT_MARKER = "harie";

/** 名称変更前のマーカー。旧名のファイルも読み込み・検索の対象に含めるために残す。 */
export const LEGACY_MARKERS: readonly string[] = ["anoi"];

export const KNOWN_MARKERS: readonly string[] = [PRODUCT_MARKER, ...LEGACY_MARKERS];

export type SaveExtension = "jpg" | "png";

const READABLE_EXTENSIONS = ["jpg", "jpeg", "png"] as const;
type ReadableExtension = (typeof READABLE_EXTENSIONS)[number];

/** 任意の文字列を `a-z 0-9 -` のみのスラッグにする。何も残らなければ null。 */
export function toFileSlug(input: string): string | null {
  const slug = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? null : slug;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** スラッグにできる名前がないときの既定名（ローカル時刻ベース）。 */
export function fallbackFileStem(now: Date): string {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `image-${date}-${time}`;
}

export function buildFileName(options: { name: string; ext: SaveExtension; now?: Date }): string {
  const stem = toFileSlug(options.name) ?? fallbackFileStem(options.now ?? new Date());
  return `${stem}.${PRODUCT_MARKER}.${options.ext}`;
}

export type ParsedFileName = {
  stem: string;
  marker: string;
  ext: ReadableExtension;
};

/**
 * ファイル名が規則に沿っていれば分解する。沿っていなければ null。
 * ファイル名はヒントでしかなく、Harie ファイルかどうかの判定は埋め込みデータで行う（ADR-0004）。
 */
export function parseFileName(fileName: string): ParsedFileName | null {
  const parts = fileName.split(".");
  if (parts.length < 3) return null;
  const ext = parts.at(-1)?.toLowerCase();
  const marker = parts.at(-2)?.toLowerCase();
  const stem = parts.slice(0, -2).join(".");
  if (stem === "" || ext === undefined || marker === undefined) return null;
  if (!(READABLE_EXTENSIONS as readonly string[]).includes(ext)) return null;
  if (!KNOWN_MARKERS.includes(marker)) return null;
  return { stem, marker, ext: ext as ReadableExtension };
}

/** 再保存時のファイル名。旧マーカーのファイルは現在のマーカーに付け替える。 */
export function renameForSave(fileName: string, ext: SaveExtension): string {
  const parsed = parseFileName(fileName);
  if (parsed) return `${parsed.stem}.${PRODUCT_MARKER}.${ext}`;
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  return buildFileName({ name: withoutExt, ext });
}
