#!/usr/bin/env node
// Harie Skill のコマンド。MCP を設定できない環境（claude.ai、Claude Code on the web、プロジェクトのスレッドなど）で、
// npm の @harie/mcp を stdio で 1 回だけ起動してツールを呼び、結果を JSON で出す（FR-MCP-09）。
// 描画・保存・PII 加工は @harie/mcp（= packages/*）がそのまま行い、ここは呼び出しと画像のファイル化だけを担う。
// 依存なし（Node 22 以上の標準モジュールのみ）。
import { spawn } from "node:child_process";
import {
  accessSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** 起動する MCP サーバー。HARIE_MCP_COMMAND（JSON の配列）で差し替えられる（テストやローカルのビルドを使うとき） */
const DEFAULT_SERVER = ["npx", "-y", "@harie/mcp@^0.6.0"];
const PROTOCOL_VERSION = "2025-06-18";
const TIMEOUT_MS = Number(process.env.HARIE_TIMEOUT_MS ?? 180_000);

/** 貼り付け・アップロードされた画像が置かれやすい場所（find が探す） */
const UPLOAD_DIRS = [
  "/mnt/user-data/uploads",
  "/mnt/project-files/uploads",
  "/mnt/data",
  join(homedir(), ".claude", "image-cache"),
  process.cwd(),
];

const USAGE = `harie.mjs — Harie（再編集できる注釈付きスクリーンショット）の操作

  find [dir...] [--limit n]          貼り付け・アップロードされた画像を新しい順に探す（拡張子なしも判定）
  import <image> [-o out] [--format jpeg|png] [--title t]
                                     普通の画像から Harie ファイルを作る（元画像は変えない）
  apply <image|file> --plan <json> [-o out] [--rev n] [--view out] [--confirm]
                                     取り込み・個人情報の加工・注釈を 1 回で行い、描いた画像を書き出す
                                     plan: {"title"?, "format"?, "masks"?: [...], "ops"?: [...]}
  open <file>                        注釈の一覧（JSON）を返す。画像は返さない（ファイルそのものを見る）
  preview <file> --ops <json> [--view out]
                                     ops を適用した画像を書き出す。ファイルは変えない
  edit <file> --ops <json> [--rev n] [--view out]
                                     ops を適用して上書き保存する
  mask <file> --masks <json> [--confirm] [-o out] [--rev n] [--view out]
                                     個人情報を隠す。--confirm なしは確認用の画像を書き出すだけ
  replace-base <file> --with <image> [-o out] [--rev n] [--view out]
                                     注釈を残して画像を差し替える
  list [dir]                         Harie ファイルを一覧する
  guide [file] [--intent text]       どこに何を補足するかの手引きを表示する
  call <tool> <json>                 MCP ツールを直接呼ぶ

<json> は JSON の文字列、@ファイル、- （標準入力）のどれか。
--view は描き直した画像の書き出し先（省略時は一時ディレクトリ。パスを出力する）。`;

class UsageError extends Error {}

// ---------- MCP クライアント（stdio, 改行区切りの JSON-RPC） ----------

function serverCommand() {
  const raw = process.env.HARIE_MCP_COMMAND;
  if (raw === undefined || raw === "") return DEFAULT_SERVER;
  const parsed = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every((s) => typeof s === "string")
  ) {
    throw new UsageError("HARIE_MCP_COMMAND は文字列の JSON 配列にしてください");
  }
  return parsed;
}

/**
 * サーバーを起動し、requests を順に送って結果を返す。終わったらサーバーを閉じる。
 * requests に関数を渡すと、send(method, params) を受け取って続けて呼べる（apply のように前の結果で分岐するとき）
 */
async function withServer(requests) {
  const [cmd, ...args] = serverCommand();
  // 操作するパスは呼び出し側が選ぶので、root はファイルシステム全体にする
  const child = spawn(cmd, [...args, "--root", "/"], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d;
  });
  const pending = new Map();
  let buffer = "";
  child.stdout.on("data", (d) => {
    buffer += d;
    for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line === "") continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = msg.id === undefined ? undefined : pending.get(msg.id);
      if (waiter === undefined) continue;
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(`MCP エラー: ${msg.error.message}`));
      else waiter.resolve(msg.result);
    }
  });
  const exited = new Promise((_, reject) => {
    child.on("error", (e) => reject(new Error(`${cmd} を起動できません: ${e.message}`)));
    child.on("exit", (code) =>
      reject(
        new Error(`MCP サーバーが終了しました（code ${code}）\n${stderr.trim().slice(-2000)}`),
      ),
    );
  });
  exited.catch(() => {});
  let nextId = 1;
  const send = (method, params) => {
    const id = nextId++;
    const result = new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return Promise.race([result, exited]);
  };
  const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
  try {
    await send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "harie-skill", version: "0.1.0" },
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
    if (typeof requests === "function") return await requests(send);
    const results = [];
    for (const [method, params] of requests) results.push(await send(method, params));
    return results;
  } finally {
    clearTimeout(timer);
    child.stdin.end();
    child.kill();
  }
}

async function callTool(name, args) {
  const [result] = await withServer([["tools/call", { name, arguments: args }]]);
  return result;
}

// ---------- 入出力 ----------

function readJsonArg(value, flag) {
  if (value === undefined) throw new UsageError(`${flag} を指定してください`);
  const text =
    value === "-"
      ? readFileSync(0, "utf8")
      : value.startsWith("@")
        ? readFileSync(value.slice(1), "utf8")
        : value;
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new UsageError(`${flag} の JSON を読めません: ${e.message}`);
  }
}

const EXT_OF_MIME = { "image/png": "png", "image/jpeg": "jpg" };

/** ツールの結果を { summary, isError, image } に分け、画像はファイルに書き出してパスだけを返す。 */
function unpack(result, viewPath) {
  const text = (result.content ?? []).find((c) => c.type === "text")?.text ?? "";
  let summary;
  try {
    summary = JSON.parse(text);
  } catch {
    summary = text;
  }
  const image = (result.content ?? []).find((c) => c.type === "image");
  const out = { ok: result.isError !== true, result: absolutize(summary) };
  if (image !== undefined) {
    const ext = EXT_OF_MIME[image.mimeType] ?? "png";
    const target = viewPath ?? join(mkdtempSync(join(tmpdir(), "harie-view-")), `view.${ext}`);
    writeFileSync(target, Buffer.from(image.data, "base64"));
    out.view = resolve(target);
  }
  return out;
}

/** サーバーの root は "/" なので、結果のパス（root からの相対）を絶対パスに戻す */
function absolutize(value) {
  if (Array.isArray(value)) return value.map(absolutize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      (k === "path" || k === "dir") && typeof v === "string" && !v.startsWith("/")
        ? `/${v === "." ? "" : v}`
        : absolutize(v),
    ]),
  );
}

function print(out) {
  console.log(JSON.stringify(out, null, 2));
  return out.ok === false ? 1 : 0;
}

/** 先頭のバイトで画像の形式を判定する（貼り付けた画像は拡張子がないことがある）。 */
function sniff(path) {
  const head = Buffer.alloc(16);
  const fd = openSync(path, "r");
  try {
    readSync(fd, head, 0, 16, 0);
  } finally {
    closeSync(fd);
  }
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP")
    return "webp";
  if (head.toString("ascii", 4, 8) === "ftyp") return "heic";
  if (head.toString("ascii", 0, 3) === "GIF") return "gif";
  return null;
}

/** PNG の IHDR / JPEG の SOF から大きさを読む（find の表示用。読めなければ null）。 */
function imageSize(bytes, format) {
  if (format === "png" && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (format === "jpeg") {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const len = bytes.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Harie の注釈データが埋め込まれていそうか（XMP の名前空間か PNG の haRi チャンク） */
function looksHarie(bytes) {
  return bytes.includes("harie.app/ns/") || bytes.includes("haRi");
}

// ---------- コマンド ----------

function find(dirs, limit) {
  const roots = dirs.length > 0 ? dirs : UPLOAD_DIRS;
  const found = [];
  const seen = new Set();
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 3) walk(full, depth + 1);
        continue;
      }
      if (!e.isFile() || seen.has(full)) continue;
      seen.add(full);
      let format;
      try {
        format = sniff(full);
      } catch {
        continue;
      }
      if (format === null) continue;
      const st = statSync(full);
      const entry = { path: full, format, bytes: st.size, modified: st.mtime.toISOString() };
      if (format === "png" || format === "jpeg") {
        const bytes = readFileSync(full);
        const size = imageSize(bytes, format);
        if (size) entry.size = `${size.width}x${size.height}`;
        entry.harie = looksHarie(bytes);
      } else {
        entry.note = "JPEG / PNG ではないので、Harie では扱えません（PNG で保存し直してもらう）";
      }
      found.push(entry);
    }
  };
  for (const d of roots) walk(resolve(d), 0);
  found.sort((a, b) => b.modified.localeCompare(a.modified));
  return { ok: true, result: { searched: roots, images: found.slice(0, limit) } };
}

function writable(dir) {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const UPLOAD_ROOTS = UPLOAD_DIRS.slice(0, -1).map((d) => `${resolve(d)}/`);

/**
 * 保存先の既定。普通に置かれた画像なら同じフォルダ（MCP の harie_create と同じ）。
 * アップロード先の画像は、claude.ai でダウンロードできる outputs、なければカレントディレクトリ
 */
function defaultOutDir(src) {
  const env = process.env.HARIE_OUT_DIR;
  if (env) return env;
  const dir = dirname(src);
  const uploaded = UPLOAD_ROOTS.some((root) => `${dir}/`.startsWith(root));
  if (!uploaded && extname(src) !== "" && writable(dir)) return dir;
  if (existsSync("/mnt/user-data/outputs") && writable("/mnt/user-data/outputs"))
    return "/mnt/user-data/outputs";
  return process.cwd();
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/** import の準備: 形式の確認・保存先・拡張子を付けた一時コピー。cleanup で一時コピーを消す */
function prepareImport(src, opts) {
  const format = sniff(src);
  if (format !== "png" && format !== "jpeg") {
    throw new UsageError(
      `${src} は ${format ?? "画像ではない形式"} です。Harie は JPEG / PNG だけを扱います`,
    );
  }
  const outFormat = opts.format ?? format;
  if (outFormat !== "png" && outFormat !== "jpeg") throw new UsageError("--format は jpeg か png");
  const ext = outFormat === "png" ? "png" : "jpg";
  const name =
    extname(src) === "" || /^[0-9a-f-]{20,}$/i.test(basename(src, extname(src)))
      ? `screenshot-${stamp()}`
      : basename(src, extname(src));
  const out = resolve(opts.out ?? join(defaultOutDir(src), `${name}.harie.${ext}`));
  // 拡張子のない元画像も扱えるよう、正しい拡張子を付けた一時コピーから作る（元画像は変えない）
  const work = mkdtempSync(join(tmpdir(), "harie-import-"));
  const copy = join(work, `${name}.${format === "png" ? "png" : "jpg"}`);
  copyFileSync(src, copy);
  return {
    out,
    args: {
      imagePath: copy,
      outPath: out,
      format: outFormat,
      ...(opts.title === undefined ? {} : { title: opts.title }),
    },
    cleanup: () => rmSync(work, { recursive: true, force: true }),
  };
}

async function importImage(src, opts) {
  const prepared = prepareImport(src, opts);
  try {
    return unpack(await callTool("harie_create", prepared.args));
  } finally {
    prepared.cleanup();
  }
}

const toolCall = (send, name, args) => send("tools/call", { name, arguments: args });

/**
 * 取り込み・個人情報の加工・注釈をまとめて 1 回で行う（手数を減らすため）。
 * plan: { title?, format?, masks?: PiiMask[], ops?: Op[] }
 * - 普通の画像なら Harie ファイルを新しく作ってから加工する（元画像は変わらない）
 * - 既存の Harie ファイルに masks を適用するのは元に戻せないので、--confirm を求める
 * 最後に描いた画像を view に書き出す。途中で失敗したらそこで止め、どこまで済んだかを返す
 */
async function apply(src, plan, opts) {
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
    throw new UsageError("--plan は { masks?, ops?, title?, format? } の JSON にしてください");
  }
  const masks = plan.masks ?? [];
  const ops = plan.ops ?? [];
  if (!Array.isArray(masks) || !Array.isArray(ops)) {
    throw new UsageError("plan の masks と ops は配列にしてください");
  }
  const done = [];
  let prepared = null;
  try {
    return await withServer(async (send) => {
      let path = src;
      const fail = (result) => ({ ...unpack(result), ok: false, done, file: path });
      // 普通の画像か Harie ファイルかは、サーバーに開かせて確かめる（拡張子のない画像も扱える）
      const opened = await toolCall(send, "harie_open", { path: src, image: false });
      if (opened.isError) return fail(opened);
      const status = unpack(opened).result.status;
      if (status !== "plain" && masks.length > 0 && !opts.confirm) {
        throw new UsageError(
          "既存の Harie ファイルへの masks は元に戻せません。範囲を mask で確かめてから --confirm を付けてください",
        );
      }
      if (status === "plain") {
        prepared = prepareImport(src, {
          ...opts,
          title: plan.title ?? opts.title,
          format: plan.format ?? opts.format,
        });
        const created = await toolCall(send, "harie_create", prepared.args);
        if (created.isError) return fail(created);
        path = prepared.out;
        done.push("import");
      }
      if (masks.length > 0) {
        const masked = await toolCall(send, "harie_mask", { path, masks, confirm: true });
        if (masked.isError) return fail(masked);
        done.push("mask");
      }
      const edited = await toolCall(send, "harie_edit", {
        path,
        ops,
        ...(opts.rev === undefined ? {} : { expectedRevision: Number(opts.rev) }),
        image: true,
      });
      if (edited.isError) return fail(edited);
      done.push("edit");
      return { ...unpack(edited, opts.view), done };
    });
  } finally {
    prepared?.cleanup();
  }
}

async function guide(file, intent) {
  const [result] = await withServer([
    [
      "prompts/get",
      {
        name: "harie_guide",
        arguments: { path: file ?? "<画像のパス>", ...(intent ? { intent } : {}) },
      },
    ],
  ]);
  return result.messages.map((m) => m.content.text).join("\n\n");
}

export async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      format: { type: "string" },
      title: { type: "string" },
      ops: { type: "string" },
      masks: { type: "string" },
      plan: { type: "string" },
      confirm: { type: "boolean" },
      rev: { type: "string" },
      view: { type: "string" },
      with: { type: "string" },
      intent: { type: "string" },
      limit: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...rest] = positionals;
  const file = rest[0];
  const need = () => {
    if (file === undefined) throw new UsageError("ファイルを指定してください");
    return resolve(file);
  };
  const rev = values.rev === undefined ? {} : { expectedRevision: Number(values.rev) };
  const view = values.view === undefined ? undefined : resolve(values.view);
  try {
    switch (command) {
      case undefined:
      case "help":
        console.log(USAGE);
        return 0;
      case "find":
        return print(find(rest, Number(values.limit ?? 10)));
      case "import":
        return print(await importImage(need(), values));
      case "apply":
        return print(await apply(need(), readJsonArg(values.plan, "--plan"), { ...values, view }));
      case "open":
        return print(unpack(await callTool("harie_open", { path: need(), image: false })));
      case "preview":
        return print(
          unpack(
            await callTool("harie_preview", {
              path: need(),
              ops: readJsonArg(values.ops, "--ops"),
            }),
            view,
          ),
        );
      case "edit":
        return print(
          unpack(
            await callTool("harie_edit", {
              path: need(),
              ops: readJsonArg(values.ops, "--ops"),
              ...rev,
              image: view !== undefined,
            }),
            view,
          ),
        );
      case "mask":
        return print(
          unpack(
            await callTool("harie_mask", {
              path: need(),
              masks: readJsonArg(values.masks, "--masks"),
              ...(values.confirm ? { confirm: true } : {}),
              ...(values.out === undefined ? {} : { outPath: resolve(values.out) }),
              ...rev,
            }),
            view,
          ),
        );
      case "replace-base":
        if (values.with === undefined)
          throw new UsageError("--with に新しい画像を指定してください");
        return print(
          unpack(
            await callTool("harie_replace_base", {
              path: need(),
              imagePath: resolve(values.with),
              ...(values.out === undefined ? {} : { outPath: resolve(values.out) }),
              ...rev,
              image: view !== undefined,
            }),
            view,
          ),
        );
      case "list":
        return print(unpack(await callTool("harie_list", { dir: resolve(file ?? ".") })));
      case "guide":
        console.log(await guide(file === undefined ? undefined : resolve(file), values.intent));
        return 0;
      case "call":
        if (file === undefined) throw new UsageError("ツール名を指定してください");
        return print(unpack(await callTool(file, readJsonArg(rest[1], "引数"))));
      default:
        throw new UsageError(`不明なコマンド: ${command}\n\n${USAGE}`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`エラー: ${e.message}`);
      return 2;
    }
    console.error(`エラー: ${e instanceof Error ? e.message : e}`);
    return 1;
  }
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2));
}
