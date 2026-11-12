// Node で描画に必要な WASM とフォントを読み込む。描画そのものは @harie/render（全環境共通）
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createRenderer,
  createWasmDecoder,
  EXTRA_FONT_FILES,
  type ImageDecoder,
  type LibHeif,
  type Renderer,
} from "@harie/render";

const require = createRequire(import.meta.url);
const read = (path: string) => new Uint8Array(readFileSync(path));

/** ビルド済み（dist/fonts に同梱）ならそれを、ソースから動かすときはフォントのパッケージを使う。 */
function font(file: string): Uint8Array {
  const bundled = fileURLToPath(new URL(`./fonts/${file}`, import.meta.url));
  if (existsSync(bundled)) return read(bundled);
  if (file.startsWith("NotoSansKR") || file.startsWith("NotoSansSC")) {
    return read(require.resolve(`@harie/render/fonts/${file}`));
  }
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
      // 補助フォント（ADR-0013）は注釈にハングル・簡体字が現れたときだけ読む
      loadExtraFont: async (f) => Object.values(EXTRA_FONT_FILES[f]).map(font),
    }))();
  return renderer;
}

/**
 * JPEG / PNG 以外の画像を読むデコーダ（FR-FILE-15）。Node にはブラウザの画像デコーダがないので WASM で読む。
 * SVG・GIF は描画エンジン（resvg）が読むので要らない。WebP と HEIC だけ読める（AVIF・BMP は読めない）
 */
export const nodeDecoder: ImageDecoder = createWasmDecoder({
  webp: async () =>
    WebAssembly.compile(readFileSync(require.resolve("@jsquash/webp/codec/dec/webp_dec.wasm"))),
  heic: async () =>
    (await import("libheif-js/libheif-wasm/libheif-bundle.mjs")).default() as LibHeif,
});
