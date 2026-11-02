// LP を dist/ に書き出す。静的ファイルをそのまま写すだけで、変換はしない。
// HARIE_SITE_APP_DIR に Web エディタのビルド結果（apps/web/dist）を渡すと dist/app/ に入れる（GitHub Pages 用）
import { createHash } from "node:crypto";
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// 先に検索・AI 向けの情報が本文とずれていないかを確かめる（ずれていたら止める）
await import("./check-seo.mjs");

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist`;

await rm(dist, { recursive: true, force: true });
await cp(`${root}src`, dist, { recursive: true });

// styles.css と main.js の参照に中身のハッシュを付ける（?v=…）。
// 付けないと、公開直後にブラウザやCDNのキャッシュに残った古い CSS と新しい HTML が組み合わさり、
// ヘッダーなどのレイアウトが崩れて見える
const assets = ["styles.css", "main.js"];
const versions = {};
for (const name of assets) {
  const body = await readFile(`${dist}/${name}`);
  versions[name] = createHash("sha256").update(body).digest("hex").slice(0, 10);
}
const pattern = new RegExp(
  `((?:href|src)="(?:\\.\\./)*)(${assets.map((a) => a.replace(".", "\\.")).join("|")})"`,
  "g",
);
for (const entry of await readdir(dist, { recursive: true })) {
  if (!entry.endsWith(".html")) continue;
  const file = `${dist}/${entry}`;
  const html = await readFile(file, "utf8");
  const next = html.replace(pattern, (_, prefix, name) => `${prefix}${name}?v=${versions[name]}"`);
  if (next !== html) await writeFile(file, next);
}

const appDir = process.env.HARIE_SITE_APP_DIR;
if (appDir) {
  await cp(appDir, `${dist}/app`, { recursive: true });
  console.log(`dist/app/ に ${appDir} を入れました`);
}
console.log("dist/ に書き出しました");
