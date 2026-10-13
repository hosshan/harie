// MCP ツールの本体（docs/03-design/integrations.md 2.2, FR-MCP-01〜04）
// LLM は呼ばない。画像を見て注釈を考えるのはクライアント側の LLM で、ここは読み書きと描画に徹する
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import {
  type BaseMediaType,
  type ImageFormat,
  readHarie,
  readImageSize,
  writeHarie,
} from "@harie/format";
import {
  applyOps,
  createDocument,
  type HarieDocument,
  type PiiMask,
  prepareForSave,
  recordPiiApplied,
  renameForSave,
} from "@harie/model";
import type { RootGuard } from "./paths";
import { nodeRenderer } from "./runtime";

/** 利用者（LLM）に返すエラー。ツール結果の isError として返す。 */
export class ToolError extends Error {}

export type ImageOut = { data: Uint8Array; mediaType: BaseMediaType };
export type ToolOutput = { summary: Record<string, unknown>; image?: ImageOut };

type Loaded = {
  path: string;
  doc: HarieDocument;
  base: { bytes: Uint8Array; mediaType: BaseMediaType };
  /** ファイルの形式。保存し直すときもこの形式で書く（ベース画像の形式とは違うことがある） */
  format: ImageFormat;
};

const mediaTypeOf = (format: ImageFormat): BaseMediaType =>
  format === "png" ? "image/png" : "image/jpeg";

function readBytes(path: string): Uint8Array {
  try {
    return new Uint8Array(readFileSync(path));
  } catch (e) {
    throw new ToolError(`ファイルを読めません: ${(e as NodeJS.ErrnoException).code ?? e}`);
  }
}

/** 一時ファイルに書いてから置き換える。書き込み途中で落ちても元のファイルを壊さない。 */
function writeAtomic(path: string, bytes: Uint8Array): void {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(tmp, bytes);
  renameSync(tmp, path);
}

function load(guard: RootGuard, path: string): Loaded {
  const absolute = guard.resolve(path);
  const read = readHarie(readBytes(absolute));
  if (read.kind === "harie") {
    return { path: absolute, doc: read.doc, base: read.base, format: read.format };
  }
  if (read.kind === "harie-mismatch" && read.doc !== undefined && read.base !== undefined) {
    // 画像だけ外部ツールで変わった場合など。埋め込みの注釈とベースから描き直せば整合が戻る
    return { path: absolute, doc: read.doc, base: read.base, format: read.format };
  }
  if (read.kind === "plain") {
    throw new ToolError(
      "注釈データのない普通の画像です。先に harie_create で Harie ファイルにしてください",
    );
  }
  throw new ToolError(`Harie ファイルとして読めません（${read.kind}）`);
}

function docSummary(doc: HarieDocument) {
  return {
    docId: doc.docId,
    revision: doc.revision,
    title: doc.meta.title,
    canvas: { width: doc.canvas.width, height: doc.canvas.height },
    annotations: doc.annotations,
    piiApplied: doc.pii.applied.length,
  };
}

async function renderImage(
  doc: HarieDocument,
  base: Loaded["base"],
  output: ImageFormat,
): Promise<ImageOut> {
  const data = await (await nodeRenderer()).render({ doc, base, output, includeSuggested: true });
  return { data, mediaType: mediaTypeOf(output) };
}

/**
 * 保存する。描画した画像に注釈データを埋め込んで書き出し、保存したドキュメントを返す。
 * output は保存形式。ベース画像は形式に関わらず読み込んだバイト列のまま埋め込む（ADR-0004）。
 */
async function save(target: string, doc: HarieDocument, base: Loaded["base"], output: ImageFormat) {
  const saved = prepareForSave(doc);
  const rendered = await (await nodeRenderer()).render({ doc: saved, base, output });
  writeAtomic(target, writeHarie({ rendered, base: base.bytes, doc: saved }));
  return { saved, rendered: { data: rendered, mediaType: mediaTypeOf(output) } };
}

const EXT_FORMATS: Record<string, ImageFormat> = { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png" };

function applyOrThrow(doc: HarieDocument, ops: readonly unknown[]): HarieDocument {
  const result = applyOps(doc, ops);
  if (!result.ok) {
    throw new ToolError(`ops[${result.error.opIndex}] を適用できません: ${result.error.message}`);
  }
  return result.value;
}

export function open(guard: RootGuard, input: { path: string }): ToolOutput {
  const absolute = guard.resolve(input.path);
  const bytes = readBytes(absolute);
  const read = readHarie(bytes);
  const path = guard.display(absolute);
  switch (read.kind) {
    case "harie":
      return {
        summary: { path, status: "ok", ...docSummary(read.doc) },
        image: { data: bytes, mediaType: mediaTypeOf(read.format) },
      };
    case "harie-mismatch":
      return {
        summary: {
          path,
          status: "mismatch",
          reason: read.reason,
          hint: "注釈データが残っていれば、harie_edit（ops は空でよい）で描き直すと整合が戻ります",
          ...(read.doc === undefined ? {} : docSummary(read.doc)),
        },
        image: { data: bytes, mediaType: mediaTypeOf(read.format) },
      };
    case "plain":
      return {
        summary: {
          path,
          status: "plain",
          size: readImageSize(bytes),
          hint: "注釈データのない普通の画像です。harie_create で Harie ファイルにできます",
        },
        image: { data: bytes, mediaType: mediaTypeOf(read.format) },
      };
    case "unsupported":
      throw new ToolError("JPEG / PNG ではありません");
    case "corrupted":
      throw new ToolError(`壊れたファイルです（${read.message}）`);
  }
}

export async function create(
  guard: RootGuard,
  input: {
    imagePath: string;
    outPath?: string | undefined;
    title?: string | undefined;
    format?: ImageFormat | undefined;
  },
): Promise<ToolOutput> {
  const source = guard.resolve(input.imagePath);
  const bytes = readBytes(source);
  const read = readHarie(bytes);
  if (read.kind === "harie")
    throw new ToolError("すでに Harie ファイルです。harie_open で開けます");
  if (read.kind !== "plain") throw new ToolError("JPEG / PNG として読めません");
  const size = readImageSize(bytes);
  if (size === null) throw new ToolError("画像の大きさを読めません");
  const mediaType = mediaTypeOf(read.format);
  // 保存形式: format の指定 → outPath の拡張子 → 元画像の形式 の順に決める
  const outFormat =
    input.format ??
    (input.outPath === undefined ? undefined : EXT_FORMATS[extname(input.outPath).toLowerCase()]) ??
    read.format;
  const ext = outFormat === "png" ? "png" : "jpg";
  const target = guard.resolve(
    input.outPath ?? join(dirname(source), renameForSave(basename(source), ext)),
  );
  if (EXT_FORMATS[extname(target).toLowerCase()] !== outFormat) {
    throw new ToolError(
      `outPath の拡張子は ${outFormat === "png" ? ".png" : ".jpg"} にしてください（${outFormat.toUpperCase()} で保存します）`,
    );
  }
  if (statSafe(target)) throw new ToolError(`既にファイルがあります: ${guard.display(target)}`);
  const doc = createDocument({
    ...size,
    ...(input.title === undefined ? {} : { title: input.title }),
  });
  const { saved } = await save(target, doc, { bytes, mediaType }, outFormat);
  return { summary: { path: guard.display(target), ...docSummary(saved) } };
}

function statSafe(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

export async function edit(
  guard: RootGuard,
  input: { path: string; ops: readonly unknown[]; expectedRevision?: number | undefined },
): Promise<ToolOutput> {
  const loaded = load(guard, input.path);
  checkRevision(loaded, input.expectedRevision);
  const next = applyOrThrow(loaded.doc, input.ops);
  const { saved, rendered } = await save(loaded.path, next, loaded.base, loaded.format);
  return { summary: { path: guard.display(loaded.path), ...docSummary(saved) }, image: rendered };
}

/**
 * PII 加工（ADR-0007）。ベース画像を不可逆に書き換えるので、`confirm: true` のときだけ保存する。
 * `confirm` がなければ加工後の見た目だけを返し、ファイルは変えない（integrations.md 2.2）。
 */
export async function mask(
  guard: RootGuard,
  input: {
    path: string;
    masks: readonly PiiMask[];
    confirm?: boolean | undefined;
    outPath?: string | undefined;
    expectedRevision?: number | undefined;
  },
): Promise<ToolOutput> {
  const loaded = load(guard, input.path);
  checkRevision(loaded, input.expectedRevision);
  const { width, height } = loaded.doc.canvas;
  const result = await (await nodeRenderer()).applyMasks({
    base: loaded.base,
    width,
    height,
    masks: input.masks,
  });
  if (result.applied.length < input.masks.length) {
    throw new ToolError(
      `画像（${width}×${height}）の外を指す範囲があります。rect を画像の中に収めてください`,
    );
  }
  const next = recordPiiApplied(loaded.doc, result.applied);
  if (input.confirm !== true) {
    return {
      summary: {
        path: guard.display(loaded.path),
        saved: false,
        applied: result.applied,
        hint: "加工後の見た目です。保存すると元に戻せません。範囲がよければ同じ masks に confirm: true を付けて呼んでください",
      },
      image: await renderImage(next, result.base, loaded.format),
    };
  }
  const target = input.outPath === undefined ? loaded.path : guard.resolve(input.outPath);
  if (target !== loaded.path) {
    if (extname(target).toLowerCase() !== extname(loaded.path).toLowerCase()) {
      throw new ToolError(`outPath の拡張子は ${extname(loaded.path)} にしてください`);
    }
    if (statSafe(target)) throw new ToolError(`既にファイルがあります: ${guard.display(target)}`);
  }
  const { saved, rendered } = await save(target, next, result.base, loaded.format);
  return {
    summary: { path: guard.display(target), saved: true, ...docSummary(saved) },
    image: rendered,
  };
}

function checkRevision(loaded: Loaded, expected: number | undefined): void {
  if (expected !== undefined && expected !== loaded.doc.revision) {
    // 楽観的ロック: 先に別の人・ツールが保存していたら上書きしない
    throw new ToolError(
      `リビジョンが一致しません（期待 ${expected}、現在 ${loaded.doc.revision}）。harie_open で開き直してください`,
    );
  }
}

export async function preview(
  guard: RootGuard,
  input: { path: string; ops: readonly unknown[] },
): Promise<ToolOutput> {
  const loaded = load(guard, input.path);
  const next = applyOrThrow(loaded.doc, input.ops);
  return {
    summary: { path: guard.display(loaded.path), saved: false, ...docSummary(next) },
    image: await renderImage(next, loaded.base, loaded.format),
  };
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const LIST_LIMIT = 500;

export function list(
  guard: RootGuard,
  input: { dir?: string | undefined; recursive?: boolean | undefined },
): ToolOutput {
  const start = guard.resolve(input.dir ?? ".");
  const files: Record<string, unknown>[] = [];
  let truncated = false;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= LIST_LIMIT) {
        truncated = true;
        return;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          input.recursive !== false &&
          !SKIP_DIRS.has(entry.name) &&
          !entry.name.startsWith(".")
        ) {
          walk(full);
        }
      } else if (entry.isFile() && IMAGE_EXT.has(extname(entry.name).toLowerCase())) {
        const read = readHarie(new Uint8Array(readFileSync(full)));
        if (read.kind === "harie" || read.kind === "harie-mismatch") {
          files.push({
            path: guard.display(full),
            status: read.kind === "harie" ? "ok" : `mismatch: ${read.reason}`,
            title: read.doc?.meta.title,
            revision: read.descriptor.revision,
            annotations: read.doc?.annotations.length,
          });
        }
      }
    }
  };
  walk(start);
  return { summary: { dir: guard.display(start), files, truncated } };
}
