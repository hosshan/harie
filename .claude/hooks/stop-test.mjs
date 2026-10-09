#!/usr/bin/env node
// Stop: 停止前に、変更したファイルに関係するテストだけを実行する（docs/05-development/ai-harness.md）
// 失敗したら exit 2 で停止を止め、Claude に失敗内容を返す。全体の検証は pnpm check と CI が受け持つ。
import { execFileSync, spawnSync } from "node:child_process";

let input = "";
for await (const chunk of process.stdin) input += chunk;
// 一度止めたあとの再停止では止めない（直せない失敗で停止が繰り返されるのを防ぐ）
if (JSON.parse(input || "{}")?.stop_hook_active) process.exit(0);

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).split("\n");
let files;
try {
  files = [
    ...git("diff", "--name-only", "HEAD"),
    ...git("ls-files", "--others", "--exclude-standard"),
  ];
} catch {
  process.exit(0);
}
const targets = [...new Set(files.filter((f) => /^(packages|apps)\/.+\.(ts|tsx|js|mjs)$/.test(f)))];
if (targets.length === 0) process.exit(0);

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "related", "--run", "--passWithNoTests", ...targets],
  { encoding: "utf8" },
);
if (result.status !== 0) {
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(-4000);
  process.stderr.write(
    `変更に関係するテストが失敗しています。直してから終えてください。\n${output}`,
  );
  process.exit(2);
}
