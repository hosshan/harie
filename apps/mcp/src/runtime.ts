// Node で描画に必要な WASM とフォントを読み込む。描画そのものは @anoi/render（全環境共通）
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createRenderer, type Renderer } from "@anoi/render";

const require = createRequire(import.meta.url);
const read = (path: string) => new Uint8Array(readFileSync(path));

/** ビルド済み（dist/fonts に同梱）ならそれを、ソースから動かすときはフォントのパッケージを使う。 */
function font(file: string): Uint8Array {
  const bundled = fileURLToPath(new URL(`./fonts/${file}`, import.meta.url));
  if (existsSync(bundled)) return read(bundled);
  const weight = file.includes("Bold") ? "700Bold" : "400Regular";
  return read(require.resolve(`@expo-google-fonts/noto-sans-jp/${weight}/${file}`));
}

let renderer: Promise<Renderer> | undefined;

export function nodeRenderer(): Promise<Renderer> {
  renderer ??= (async () =>
    createRenderer({
      resvgWasm: read(require.resolve("@resvg/resvg-wasm/index_bg.wasm")),
      jpegEncoderWasm: await WebAssembly.compile(
        read(require.resolve("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm")),
      ),
      fonts: [font("NotoSansJP_400Regular.ttf"), font("NotoSansJP_700Bold.ttf")],
    }))();
  return renderer;
}
