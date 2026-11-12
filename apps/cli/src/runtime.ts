// Node で描画に必要な WASM とフォントを読み込む。描画そのものは @harie/render（全環境共通）
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  createRenderer,
  createWasmDecoder,
  EXTRA_FONT_FILES,
  type ImageDecoder,
  type LibHeif,
  type Renderer,
} from "@harie/render";

const require = createRequire(import.meta.url);
const read = (id: string) => new Uint8Array(readFileSync(require.resolve(id)));

let renderer: Promise<Renderer> | undefined;

export function nodeRenderer(): Promise<Renderer> {
  renderer ??= (async () =>
    createRenderer({
      resvgWasm: read("@resvg/resvg-wasm/index_bg.wasm"),
      jpegEncoderWasm: await WebAssembly.compile(read("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm")),
      fonts: [
        read("@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf"),
        read("@expo-google-fonts/noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf"),
      ],
      // 補助フォント（ADR-0013）は注釈にハングル・簡体字が現れたときだけ読む
      loadExtraFont: async (font) =>
        Object.values(EXTRA_FONT_FILES[font]).map((file) => read(`@harie/render/fonts/${file}`)),
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
