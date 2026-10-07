// 開発用 CLI のコマンド本体。手元で Anoi ファイルを作る・検査する・描き直すためのもの（実装計画 M1）
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { type BaseMediaType, readAnoi, readImageSize, writeAnoi } from "@anoi/format";
import {
  type AnoiDocument,
  createDocument,
  migrateDocument,
  PiiMaskSchema,
  prepareForSave,
  recordPiiApplied,
  renameForSave,
} from "@anoi/model";
import { nodeRenderer } from "./runtime";

/** 利用者に見せるエラー。スタックトレースを出さずにメッセージだけ表示する。 */
export class CliError extends Error {}

type Loaded = { doc: AnoiDocument; base: { bytes: Uint8Array; mediaType: BaseMediaType } };

function loadAnoi(path: string): Loaded {
  const read = readAnoi(new Uint8Array(readFileSync(path)));
  switch (read.kind) {
    case "anoi":
      return { doc: read.doc, base: read.base };
    case "anoi-mismatch":
      if (read.doc !== undefined && read.base !== undefined) {
        // 外部ツールで画像だけ変わった場合など。埋め込みの注釈とベースから描き直せば整合が戻る
        return { doc: read.doc, base: read.base };
      }
      throw new CliError(`${path}: Anoi のデータを復元できません（${read.reason}）`);
    case "plain":
      throw new CliError(
        `${path}: 注釈データのない普通の画像です。先に \`anoi create\` してください`,
      );
    case "unsupported":
      throw new CliError(`${path}: JPEG / PNG ではありません`);
    case "corrupted":
      throw new CliError(`${path}: 壊れたファイルです（${read.message}）`);
  }
}

const extOf = (mediaType: BaseMediaType) => (mediaType === "image/png" ? "png" : "jpg");

function defaultOut(input: string, mediaType: BaseMediaType): string {
  return join(dirname(input), renameForSave(basename(input), extOf(mediaType)));
}

/** ドキュメントとベース画像から描き、Anoi ファイルとして書き出す。出力形式はベース画像に合わせる。 */
async function save(loaded: Loaded, out: string, now?: Date): Promise<string> {
  const doc = prepareForSave(loaded.doc, now === undefined ? {} : { now });
  const output = loaded.base.mediaType === "image/png" ? "png" : "jpeg";
  const rendered = await (await nodeRenderer()).render({ doc, base: loaded.base, output });
  writeFileSync(out, writeAnoi({ rendered, base: loaded.base.bytes, doc }));
  return out;
}

export function inspect(path: string, options: { json?: boolean } = {}): string {
  const bytes = new Uint8Array(readFileSync(path));
  const read = readAnoi(bytes);
  if (options.json) {
    const { base, ...rest } = read as { base?: { bytes: Uint8Array; mediaType: string } };
    const summary =
      base === undefined
        ? rest
        : { ...rest, base: { mediaType: base.mediaType, size: base.bytes.length } };
    return JSON.stringify(summary, null, 2);
  }
  const lines = [`ファイル: ${path}（${bytes.length.toLocaleString()} バイト）`];
  const size = readImageSize(bytes);
  if (size !== null) lines.push(`大きさ: ${size.width}×${size.height}`);
  switch (read.kind) {
    case "plain":
      lines.push(`状態: 普通の画像（${read.format}、注釈データなし）`);
      break;
    case "unsupported":
      lines.push("状態: 未対応の形式");
      break;
    case "corrupted":
      lines.push(`状態: 壊れている（${read.message}）`);
      break;
    case "anoi":
    case "anoi-mismatch": {
      lines.push(
        read.kind === "anoi"
          ? `状態: Anoi ファイル（${read.format}）`
          : `状態: 不整合（${read.reason}）`,
        `形式バージョン: ${read.descriptor.formatVersion}`,
        `docId: ${read.descriptor.docId} / revision: ${read.descriptor.revision}`,
      );
      if (read.base !== undefined) {
        lines.push(
          `ベース画像: ${read.base.mediaType}（${read.base.bytes.length.toLocaleString()} バイト）`,
        );
      }
      const doc = read.doc;
      if (doc !== undefined) {
        const counts = new Map<string, number>();
        for (const a of doc.annotations) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
        const list = [...counts].map(([t, c]) => `${t}×${c}`).join(", ");
        lines.push(`注釈: ${doc.annotations.length} 個${list === "" ? "" : `（${list}）`}`);
        lines.push(`PII 加工: ${doc.pii.applied.length} 件`);
        if (doc.meta.title !== undefined) lines.push(`タイトル: ${doc.meta.title}`);
      }
    }
  }
  return lines.join("\n");
}

/** 普通の画像から、注釈のない Anoi ファイルを作る（FR-FILE-08）。 */
export async function create(
  imagePath: string,
  options: { out?: string; title?: string; now?: Date } = {},
): Promise<string> {
  const bytes = new Uint8Array(readFileSync(imagePath));
  const read = readAnoi(bytes);
  if (read.kind === "anoi") throw new CliError(`${imagePath}: すでに Anoi ファイルです`);
  if (read.kind === "unsupported" || read.kind === "corrupted") {
    throw new CliError(`${imagePath}: JPEG / PNG として読めません`);
  }
  const size = readImageSize(bytes);
  if (size === null) throw new CliError(`${imagePath}: 画像の大きさを読めません`);
  const mediaType: BaseMediaType = read.format === "png" ? "image/png" : "image/jpeg";
  const doc = createDocument({
    ...size,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const out = options.out ?? defaultOut(imagePath, mediaType);
  return save({ doc, base: { bytes, mediaType } }, out, options.now);
}

/** 埋め込みの注釈（または `--doc` で渡した JSON）で描き直す。 */
export async function render(
  path: string,
  options: { doc?: string; out?: string; now?: Date } = {},
): Promise<string> {
  const loaded = loadAnoi(path);
  if (options.doc !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(options.doc, "utf8"));
    } catch (e) {
      throw new CliError(`${options.doc}: JSON として読めません（${(e as Error).message}）`);
    }
    const migrated = migrateDocument(raw);
    if (!migrated.ok) {
      const e = migrated.error;
      const detail = e.kind === "Invalid" ? e.message : `未対応のバージョン ${e.version}`;
      throw new CliError(`${options.doc}: ${detail}`);
    }
    if (migrated.value.docId !== loaded.doc.docId) {
      throw new CliError(`${options.doc}: docId がファイルと一致しません`);
    }
    loaded.doc = migrated.value;
  }
  return save(loaded, options.out ?? path, options.now);
}

/** 注釈 JSON とベース画像を取り出す。 */
export function extract(path: string, options: { doc?: string; base?: string }): string[] {
  const loaded = loadAnoi(path);
  const written: string[] = [];
  if (options.doc !== undefined) {
    writeFileSync(options.doc, `${JSON.stringify(loaded.doc, null, 2)}\n`);
    written.push(options.doc);
  }
  if (options.base !== undefined) {
    writeFileSync(options.base, loaded.base.bytes);
    written.push(options.base);
  }
  if (written.length === 0) throw new CliError("--doc か --base のどちらかを指定してください");
  return written;
}

/** PII 加工をベース画像に不可逆に適用して保存する（ADR-0007）。 */
export async function mask(
  path: string,
  options: {
    rect: string;
    method: string;
    kind: string;
    text?: string;
    color?: string;
    out?: string;
    now?: Date;
  },
): Promise<string> {
  const loaded = loadAnoi(path);
  const nums = options.rect.split(",").map(Number);
  if (nums.length !== 4 || nums.some((v) => !Number.isFinite(v))) {
    throw new CliError("--rect は x,y,w,h の 4 つの数値で指定してください");
  }
  const [x, y, w, h] = nums;
  const parsed = PiiMaskSchema.safeParse({
    kind: options.kind,
    method: options.method,
    rect: { x, y, w, h },
    ...(options.text === undefined ? {} : { replacement: options.text }),
    ...(options.color === undefined ? {} : { color: options.color }),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CliError(`マスクの指定が不正です（${issue?.path.join(".")}: ${issue?.message}）`);
  }
  const { width, height } = loaded.doc.canvas;
  const result = await (await nodeRenderer()).applyMasks({
    base: loaded.base,
    width,
    height,
    masks: [parsed.data],
  });
  if (result.applied.length === 0) throw new CliError("範囲が画像の外です");
  const masked = { doc: recordPiiApplied(loaded.doc, result.applied), base: result.base };
  return save(masked, options.out ?? path, options.now);
}
