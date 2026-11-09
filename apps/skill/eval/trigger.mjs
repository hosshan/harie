// Skill が呼ばれるべき頼み方で呼ばれ、関係ない頼み方では呼ばれないかを確かめる（FR-MCP-09）
// 使い方: node apps/skill/eval/trigger.mjs [--runs 2] [--model claude-sonnet-5-5] [--out dir]
// claude -p を Skill のプラグインだけを読み込んで起動し、最初の数回のツール呼び出しに Skill（harie:harie）があるかを見る。
// 見たいのは「どのツールを選ぶか」だけなので、Bash や Write は選べるが許可しない（呼んでも実行されない）
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { childEnv } from "../../mcp/eval/env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    runs: { type: "string", default: "2" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    parallel: { type: "string", default: "4" },
    out: { type: "string" },
  },
});
const out = args.out ?? mkdtempSync(join(tmpdir(), "skill-trigger-"));
mkdirSync(out, { recursive: true });
const fixture = join(here, "../../mcp/eval/fixtures/notifications.png");

/** [Skill が呼ばれるべきか, 頼み方] */
const PROMPTS = [
  [
    true,
    "notifications.png に、Slack 通知を設定する手順の注釈を付けて、ガイド用の画像にしてください",
  ],
  [true, "このフォルダのスクリーンショットに枠と番号と説明を入れて、マニュアルに貼れるようにして"],
  [true, "guide.harie.png の 2 番の吹き出しの文言を「保存を押します」に直して"],
  [true, "notifications.png に写っている名前とメールアドレスを隠して、社外に共有できる画像にして"],
  [
    true,
    "画面が新しくなったので、guide.harie.png の画像だけ new.png に差し替えて。注釈はそのまま残して",
  ],
  [true, "アップロードした画面キャプチャに、操作説明の吹き出しを付けてください"],
  [false, "notifications.png の幅と高さを教えて"],
  [false, "notifications.png を WebP に変換して"],
  [false, "notifications.png をグレースケールにして"],
  [false, "このフォルダにあるファイルを一覧して"],
  [false, "Python で 1 から 10 までの合計を出すスクリプトを書いて"],
  [false, "このフォルダに README.md を作って、中身は「テスト」の一行だけにして"],
];

function run(prompt, i) {
  const cwd = join(out, `p${i}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(cwd, { recursive: true });
  for (const name of ["notifications.png", "new.png", "guide.harie.png"]) {
    copyFileSync(fixture, join(cwd, name));
  }
  const cli = [
    "-p",
    prompt,
    "--model",
    args.model,
    "--output-format",
    "stream-json",
    "--verbose",
    "--setting-sources",
    "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--tools",
    "Bash,Read,Write,Edit,Glob,Skill",
    "--allowedTools",
    "Read,Glob,Skill",
    "--plugin-dir",
    join(here, ".."),
  ];
  return new Promise((resolve) => {
    const child = spawn("claude", cli, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    const calls = [];
    let buffer = "";
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      child.kill("SIGTERM");
      resolve(calls);
    };
    child.stdout.on("data", (d) => {
      buffer += d;
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        let e;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (e.type !== "assistant") continue;
        for (const c of e.message.content ?? []) {
          if (c.type === "tool_use") {
            calls.push(c.name === "Skill" ? `Skill:${c.input.skill}` : c.name);
          }
        }
        // 呼ばれたか、最初の 3 回のツール呼び出しで呼ばれなかったかが分かれば止める
        if (calls.some((c) => c.startsWith("Skill:")) || calls.length >= 3) done();
      }
    });
    child.on("close", done);
    setTimeout(done, 180_000);
  });
}

const jobs = PROMPTS.flatMap(([expected, prompt], i) =>
  Array.from({ length: Number(args.runs) }, () => ({ expected, prompt, i })),
);
const results = [];
const queue = [...jobs];
await Promise.all(
  Array.from({ length: Number(args.parallel) }, async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      const calls = await run(job.prompt, job.i);
      const triggered = calls.some((c) => c === "Skill:harie:harie" || c === "Skill:harie");
      results.push({ ...job, triggered, calls });
      console.error(
        `${triggered === job.expected ? "OK" : "NG"} ${job.prompt} → ${calls.join(", ") || "（ツールなし）"}`,
      );
    }
  }),
);
writeFileSync(join(out, "trigger.json"), `${JSON.stringify(results, null, 2)}\n`);
const correct = results.filter((r) => r.triggered === r.expected).length;
console.log(`${correct}/${results.length} 正解（${out}/trigger.json）`);
