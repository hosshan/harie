// MCP あり／なしで同じお題を Claude Code（claude -p）に解かせ、トランスクリプトと指標を残す
// 使い方は README.md を参照
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { childEnv } from "./env.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    runs: { type: "string", default: "5" },
    conditions: { type: "string", default: "mcp,nomcp" },
    tasks: { type: "string", default: "create,revise" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    parallel: { type: "string", default: "4" },
    // MCP サーバーの起動コマンド。手元のビルドを測るときは "node /path/to/apps/mcp/dist/index.mjs"
    mcp: { type: "string", default: "npx -y @harie/mcp@0.2.0" },
    timeout: { type: "string", default: "900" },
  },
});

// 作業ディレクトリの名前からお題以外の情報が漏れないよう、リポジトリの外の中立な名前にする
const out =
  args.out ?? join(tmpdir(), `guide-eval-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(out, { recursive: true });

const CONDITIONS = {
  mcp: {
    tools: ["Read", "Glob"],
    allowed: ["mcp__harie"],
    hint: "画像の編集には harie MCP のツールを使ってください。",
  },
  nomcp: {
    tools: ["Bash", "Read", "Write", "Edit", "Glob"],
    allowed: ["Bash", "Read", "Write", "Edit", "Glob"],
    hint: "画像の編集は Python（Pillow）などで行ってください。",
  },
};

const TASKS = {
  create: `このフォルダの notifications.png は、タスク管理 SaaS の通知設定画面のスクリーンショットです。利用ガイドに載せる画像を作ってください。
- 説明したいこと: Slack に通知を送るように設定する手順
- 操作する箇所を枠で囲み、操作の順番と短い説明文を添える
- 画面に写っている個人情報（氏名・メールアドレス）は読めないように加工する
- 完成した画像はこのフォルダに保存し、最後に保存したファイル名だけを答える`,
  revise: `このフォルダにある、前回 notifications.png から作った利用ガイド用の画像を直してください。
- 通知先チャンネルを選ぶ手順の説明文を「通知を送るチャンネルを選びます（例: #release）」に変える
- 画面右上の「?」アイコンに「困ったときはここから問い合わせできます」という補足を加える
- それ以外の注釈と加工はそのまま残す
- 保存したら、最後に保存したファイル名だけを答える`,
};

function runClaude({ cwd, condition, task }) {
  const cond = CONDITIONS[condition];
  const cli = [
    "-p",
    `${TASKS[task]}\n${cond.hint}`,
    "--model",
    args.model,
    "--output-format",
    "stream-json",
    "--verbose",
    "--setting-sources",
    "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--permission-mode",
    "bypassPermissions",
    "--tools",
    cond.tools.join(","),
    "--allowedTools",
    cond.allowed.join(","),
  ];
  if (condition === "mcp") {
    const [command, ...rest] = args.mcp.split(" ");
    const config = {
      mcpServers: { harie: { command, args: [...rest, "--root", cwd] } },
    };
    const configPath = join(cwd, "..", `${task}.mcp.json`);
    writeFileSync(configPath, JSON.stringify(config));
    cli.push("--mcp-config", configPath);
  }
  return new Promise((resolve) => {
    const child = spawn("claude", cli, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), Number(args.timeout) * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** stream-json のトランスクリプトから指標を取り出す */
function metricsOf(lines) {
  const events = lines.flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const seen = new Map();
  const toolCalls = {};
  let imagesInResults = 0;
  let toolErrors = 0;
  let toolResultChars = 0;
  for (const e of events) {
    if (e.type === "assistant") {
      seen.set(e.message.id, e.message.usage);
      for (const c of e.message.content ?? []) {
        if (c.type === "tool_use") toolCalls[c.name] = (toolCalls[c.name] ?? 0) + 1;
      }
    }
    if (e.type === "user") {
      for (const c of e.message.content ?? []) {
        if (c.type !== "tool_result") continue;
        if (c.is_error) toolErrors++;
        const parts = Array.isArray(c.content) ? c.content : [{ type: "text", text: c.content }];
        for (const p of parts) {
          if (p.type === "image") imagesInResults++;
          if (p.type === "text") toolResultChars += (p.text ?? "").length;
        }
      }
    }
  }
  const usages = [...seen.values()];
  const ctx = (u) =>
    (u?.input_tokens ?? 0) +
    (u?.cache_read_input_tokens ?? 0) +
    (u?.cache_creation_input_tokens ?? 0);
  const result = events.find((e) => e.type === "result");
  return {
    ok: result?.subtype === "success" && !result?.is_error,
    answer: result?.result ?? null,
    turns: result?.num_turns ?? usages.length,
    durationMs: result?.duration_ms ?? null,
    costUsd: result?.total_cost_usd ?? null,
    // API 呼び出しごとの入力（キャッシュ込み）の合計。エージェントが読んだ量の総和
    inputTokensTotal: usages.reduce((s, u) => s + ctx(u), 0),
    // ストリーム途中の usage は出力トークンが途中の値なので、合計は result の値を使う
    outputTokensTotal:
      result?.usage?.output_tokens ?? usages.reduce((s, u) => s + (u?.output_tokens ?? 0), 0),
    // 最後の呼び出しの入力。作業を終えた時点のコンテキストの大きさ
    finalContextTokens: ctx(usages.at(-1)),
    toolCalls,
    toolCallsTotal: Object.values(toolCalls).reduce((s, n) => s + n, 0),
    toolErrors,
    imagesInResults,
    toolResultChars,
  };
}

function listFiles(dir) {
  return readdirSync(dir)
    .filter((f) => !f.startsWith("."))
    .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }));
}

async function trial(condition, i) {
  const base = join(out, condition, `run-${i}`);
  const results = {};
  let prev = null;
  for (const task of args.tasks.split(",")) {
    const cwd = join(base, task);
    mkdirSync(cwd, { recursive: true });
    if (task === "create" || prev === null) {
      cpSync(join(here, "fixtures/notifications.png"), join(cwd, "notifications.png"));
    }
    if (prev !== null) cpSync(prev, cwd, { recursive: true });
    const before = new Set(listFiles(cwd).map((x) => `${x.f}@${x.mtime}`));
    const started = Date.now();
    const { code, stdout, stderr } = await runClaude({ cwd, condition, task });
    writeFileSync(join(base, `${task}.transcript.jsonl`), stdout);
    if (stderr) writeFileSync(join(base, `${task}.stderr.txt`), stderr);
    const m = metricsOf(stdout.split("\n"));
    const changed = listFiles(cwd)
      .filter((x) => !before.has(`${x.f}@${x.mtime}`))
      .map((x) => x.f);
    const images = changed.filter((f) => /\.(png|jpe?g)$/i.test(f));
    const named = images.find((f) => m.answer?.includes(f));
    const metrics = {
      condition,
      run: i,
      task,
      exitCode: code,
      wallMs: Date.now() - started,
      ...m,
      changedFiles: changed,
      outputImage: named ?? images.at(-1) ?? null,
    };
    writeFileSync(join(base, `${task}.metrics.json`), `${JSON.stringify(metrics, null, 2)}\n`);
    console.error(
      `${condition} #${i} ${task}: ok=${m.ok} turns=${m.turns} tools=${m.toolCallsTotal} in=${m.inputTokensTotal} out=${m.outputTokensTotal} → ${metrics.outputImage}`,
    );
    results[task] = metrics;
    prev = cwd;
  }
  return results;
}

const jobs = [];
for (const condition of args.conditions.split(",")) {
  if (!CONDITIONS[condition]) throw new Error(`unknown condition: ${condition}`);
  for (let i = 1; i <= Number(args.runs); i++) jobs.push([condition, i]);
}
writeFileSync(
  join(out, "config.json"),
  `${JSON.stringify({ ...args, out, tasks: TASKS, conditions: CONDITIONS, startedAt: new Date().toISOString() }, null, 2)}\n`,
);
const queue = [...jobs];
await Promise.all(
  Array.from({ length: Number(args.parallel) }, async () => {
    while (queue.length > 0) {
      const [condition, i] = queue.shift();
      await trial(condition, i);
    }
  }),
);
console.log(out);
