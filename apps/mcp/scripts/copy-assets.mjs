// ビルド後に、描画に使うフォント（Regular / Bold のみ）を dist/fonts に置く。
// フォントのパッケージは全ウェイトで約 50MB あるため、配布物には必要な 2 つだけを含める
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = new URL("../dist/fonts/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const file of ["400Regular/NotoSansJP_400Regular.ttf", "700Bold/NotoSansJP_700Bold.ttf"]) {
  const src = require.resolve(`@expo-google-fonts/noto-sans-jp/${file}`);
  copyFileSync(src, new URL(file.split("/")[1], out));
}
// 補助フォント（ハングル・簡体字。ADR-0013）。packages/render/fonts から取る
for (const file of [
  "NotoSansKR-Hangul-400.ttf",
  "NotoSansKR-Hangul-700.ttf",
  "NotoSansSC-Supplement-400.ttf",
  "NotoSansSC-Supplement-700.ttf",
]) {
  copyFileSync(require.resolve(`@harie/render/fonts/${file}`), new URL(file, out));
}
// フォントのライセンス（SIL Open Font License 1.1）を同梱する
copyFileSync(
  require.resolve("@expo-google-fonts/noto-sans-jp/LICENSE_FONT"),
  new URL("OFL.txt", out),
);
