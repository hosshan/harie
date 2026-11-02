// Node で描画に必要な WASM とフォントを読み込む。描画そのものは @harie/render（全環境共通）
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createRenderer, EXTRA_FONT_FILES, type Renderer } from "@harie/render";

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
