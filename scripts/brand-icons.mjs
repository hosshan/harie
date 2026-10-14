// docs/brand の SVG から、Web（PWA）と Chrome 拡張のアイコン PNG を作る。
// ロゴを変えたら `pnpm brand:icons` で作り直してコミットする
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// resvg-wasm は packages/render の依存なので、そこから解決する
const require = createRequire(join(root, "packages/render/package.json"));
const { initWasm, Resvg } = require("@resvg/resvg-wasm");
await initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));

const symbol = readFileSync(join(root, "docs/brand/harie-symbol.svg"), "utf8");
const appIcon = readFileSync(join(root, "docs/brand/harie-app-icon.svg"), "utf8");

function png(svg, size, out) {
  const bytes = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(join(root, out), bytes);
  console.log(out);
}

// Web: タブのアイコンは背景なしのシンボル、ホーム画面・PWA は背景付き（maskable の安全域にも収まる）
writeFileSync(join(root, "apps/web/public/icon.svg"), symbol);
png(appIcon, 192, "apps/web/public/icon-192.png");
png(appIcon, 512, "apps/web/public/icon-512.png");
png(appIcon, 512, "apps/web/public/icon-maskable-512.png");
png(appIcon, 180, "apps/web/public/apple-touch-icon.png");
// Chrome 拡張: ツールバーに置くので背景なし
for (const size of [16, 32, 48, 128]) png(symbol, size, `apps/extension/public/icon/${size}.png`);
