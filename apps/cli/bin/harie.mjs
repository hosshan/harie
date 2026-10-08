#!/usr/bin/env node
// 開発用 CLI の入口。TypeScript のソースを tsx で直接読み込む（ビルド不要）
import { register } from "tsx/esm/api";

register();
const { main } = await import("../src/main.ts");
process.exitCode = await main(process.argv.slice(2));
