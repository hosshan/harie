// LP を dist/ に書き出す。静的ファイルをそのまま写すだけで、変換はしない。
// HARIE_SITE_APP_DIR に Web エディタのビルド結果（apps/web/dist）を渡すと dist/app/ に入れる（GitHub Pages 用）
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// 先に検索・AI 向けの情報が本文とずれていないかを確かめる（ずれていたら止める）
await import("./check-seo.mjs");

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist`;

await rm(dist, { recursive: true, force: true });
await cp(`${root}src`, dist, { recursive: true });

const appDir = process.env.HARIE_SITE_APP_DIR;
if (appDir) {
  await cp(appDir, `${dist}/app`, { recursive: true });
  console.log(`dist/app/ に ${appDir} を入れました`);
}
console.log("dist/ に書き出しました");
