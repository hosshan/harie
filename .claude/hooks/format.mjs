#!/usr/bin/env node
// PostToolUse: Claude が編集したファイルを Biome で整形する（docs/05-development/ai-harness.md）
import { execFileSync } from "node:child_process";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const filePath = JSON.parse(input || "{}")?.tool_input?.file_path;
if (typeof filePath === "string" && /\.(ts|tsx|js|mjs|cjs|json|jsonc|css)$/.test(filePath)) {
  try {
    execFileSync(
      "pnpm",
      ["exec", "biome", "check", "--write", "--no-errors-on-unmatched", filePath],
      {
        stdio: "ignore",
      },
    );
  } catch {
    // 整形できない（構文エラー等）場合は何もしない。lint エラーは pnpm check で検出する
  }
}
