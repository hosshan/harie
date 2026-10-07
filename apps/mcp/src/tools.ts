// MCP ツールの本体（docs/03-design/integrations.md 2.2, FR-MCP-01〜04）
// LLM は呼ばない。画像を見て注釈を考えるのはクライアント側の LLM で、ここは読み書きと描画に徹する
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { type BaseMediaType, readAnoi, readImageSize, writeAnoi } from "@anoi/format";
import {
  type AnoiDocument,
  applyOps,
  createDocument,
  prepareForSave,
  renameForSave,
} from "@anoi/model";
import type { RootGuard } from "./paths";
import { nodeRenderer } from "./runtime";

/** 利用者（LLM）に返すエラー。ツール結果の isError として返す。 */
export class ToolError extends Error {}

export type ImageOut = { data: Uint8Array; mediaType: BaseMediaType };
export type ToolOutput = { summary: Record<string, unknown>; image?: ImageOut };

type Loaded = {
  path: string;
  doc: AnoiDocument;
  base: { bytes: Uint8Array; mediaType: BaseMediaType };
};

const mediaTypeOf = (format: "jpeg" | "png"): BaseMediaType =>
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
  const read = readAnoi(readBytes(absolute));
  if (read.kind === "anoi") return { path: absolute, doc: read.doc, base: read.base };
  if (read.kind === "anoi-mismatch" && read.doc !== undefined && read.base !== undefined) {
    // 画像だけ外部ツールで変わった場合など。埋め込みの注釈とベースから描き直せば整合が戻る
    return { path: absolute, doc: read.doc, base: read.base };
  }
  if (read.kind === "plain") {
    throw new ToolError(
      "注釈データのない普通の画像です。先に anoi_create で Anoi ファイルにしてください",
    );
  }
  throw new ToolError(`Anoi ファイルとして読めません（${read.kind}）`);
}

function docSummary(doc: AnoiDocument) {
  return {
    docId: doc.docId,
    revision: doc.revision,
    title: doc.meta.title,
    canvas: { width: doc.canvas.width, height: doc.canvas.height },
    annotations: doc.annotations,
    piiApplied: doc.pii.applied.length,
  };
}

async function renderImage(doc: AnoiDocument, base: Loaded["base"]): Promise<ImageOut> {
  const output = base.mediaType === "image/png" ? "png" : "jpeg";
  const data = await (await nodeRenderer()).render({ doc, base, output, includeSuggested: true });
  return { data, mediaType: base.mediaType };
}

/** 保存する。描画した画像に注釈データを埋め込んで書き出し、保存したドキュメントを返す。 */
async function save(target: string, doc: AnoiDocument, base: Loaded["base"]) {
  const saved = prepareForSave(doc);
  const output = base.mediaType === "image/png" ? "png" : "jpeg";
  const rendered = await (await nodeRenderer()).render({ doc: saved, base, output });
  writeAtomic(target, writeAnoi({ rendered, base: base.bytes, doc: saved }));
  return { saved, rendered: { data: rendered, mediaType: base.mediaType } };
}

function applyOrThrow(doc: AnoiDocument, ops: readonly unknown[]): AnoiDocument {
  const result = applyOps(doc, ops);
  if (!result.ok) {
    throw new ToolError(`ops[${result.error.opIndex}] を適用できません: ${result.error.message}`);
  }
  return result.value;
}

export function open(guard: RootGuard, input: { path: string }): ToolOutput {
  const absolute = guard.resolve(input.path);
  const bytes = readBytes(absolute);
  const read = readAnoi(bytes);
  const path = guard.display(absolute);
  switch (read.kind) {
    case "anoi":
      return {
        summary: { path, status: "ok", ...docSummary(read.doc) },
        image: { data: bytes, mediaType: mediaTypeOf(read.format) },
      };
    case "anoi-mismatch":
      return {
        summary: {
          path,
          status: "mismatch",
          reason: read.reason,
          hint: "注釈データが残っていれば、anoi_edit（ops は空でよい）で描き直すと整合が戻ります",
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
          hint: "注釈データのない普通の画像です。anoi_create で Anoi ファイルにできます",
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
  input: { imagePath: string; outPath?: string | undefined; title?: string | undefined },
): Promise<ToolOutput> {
  const source = guard.resolve(input.imagePath);
  const bytes = readBytes(source);
  const read = readAnoi(bytes);
  if (read.kind === "anoi") throw new ToolError("すでに Anoi ファイルです。anoi_open で開けます");
  if (read.kind !== "plain") throw new ToolError("JPEG / PNG として読めません");
  const size = readImageSize(bytes);
  if (size === null) throw new ToolError("画像の大きさを読めません");
  const mediaType = mediaTypeOf(read.format);
  const ext = read.format === "png" ? "png" : "jpg";
  const target = guard.resolve(
    input.outPath ?? join(dirname(source), renameForSave(basename(source), ext)),
  );
  if (extname(target).toLowerCase() !== `.${ext}`) {
    throw new ToolError(
      `outPath の拡張子は .${ext} にしてください（元画像と同じ形式で保存します）`,
    );
  }
  if (statSafe(target)) throw new ToolError(`既にファイルがあります: ${guard.display(target)}`);
  const doc = createDocument({
    ...size,
    ...(input.title === undefined ? {} : { title: input.title }),
  });
  const { saved } = await save(target, doc, { bytes, mediaType });
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
  if (input.expectedRevision !== undefined && input.expectedRevision !== loaded.doc.revision) {
    // 楽観的ロック: 先に別の人・ツールが保存していたら上書きしない
    throw new ToolError(
      `リビジョンが一致しません（期待 ${input.expectedRevision}、現在 ${loaded.doc.revision}）。anoi_open で開き直してください`,
    );
  }
  const next = applyOrThrow(loaded.doc, input.ops);
  const { saved, rendered } = await save(loaded.path, next, loaded.base);
  return { summary: { path: guard.display(loaded.path), ...docSummary(saved) }, image: rendered };
}

export async function preview(
  guard: RootGuard,
  input: { path: string; ops: readonly unknown[] },
): Promise<ToolOutput> {
  const loaded = load(guard, input.path);
  const next = applyOrThrow(loaded.doc, input.ops);
  return {
    summary: { path: guard.display(loaded.path), saved: false, ...docSummary(next) },
    image: await renderImage(next, loaded.base),
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
        const read = readAnoi(new Uint8Array(readFileSync(full)));
        if (read.kind === "anoi" || read.kind === "anoi-mismatch") {
          files.push({
            path: guard.display(full),
            status: read.kind === "anoi" ? "ok" : `mismatch: ${read.reason}`,
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
