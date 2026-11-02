import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import encodeJpeg from "@jsquash/jpeg/encode.js";
import { EXTRA_FONT_FILES, type ExtraFont } from "../extra-fonts";
import { createRenderer, type Renderer } from "../renderer";

const require = createRequire(import.meta.url);
const read = (id: string) => new Uint8Array(readFileSync(require.resolve(id)));

let renderer: Promise<Renderer> | undefined;

/** Node で WASM とフォントを読み込んだレンダラ。ブラウザでは fetch で同じものを渡す。 */
export function nodeRenderer(): Promise<Renderer> {
  renderer ??= createNodeRenderer({ extraFonts: true });
  return renderer;
}

/** 補助フォント（ADR-0013）の有無を選んでレンダラを作る。テストで比べるために使う */
export async function createNodeRenderer(opts: { extraFonts: boolean }): Promise<Renderer> {
  return createRenderer({
    resvgWasm: read("@resvg/resvg-wasm/index_bg.wasm"),
    jpegEncoderWasm: await WebAssembly.compile(read("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm")),
    fonts: [
      read("@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf"),
      read("@expo-google-fonts/noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf"),
    ],
    ...(opts.extraFonts && {
      loadExtraFont: async (font: ExtraFont) =>
        Object.values(EXTRA_FONT_FILES[font]).map(
          (file) => new Uint8Array(readFileSync(new URL(`../../fonts/${file}`, import.meta.url))),
        ),
    }),
  });
}

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../../../format/fixtures/${name}`, import.meta.url)));
}

/**
 * 実際のスクリーンショットに近い大きさ・情報量の JPEG を合成する（NFR-PERF-01 の計測用）。
 * 実在の画面を使わないためにテスト内で生成する。`nodeRenderer()` の後に呼ぶこと（エンコーダの初期化が要る）。
 */
export async function syntheticJpeg(width: number, height: number): Promise<Uint8Array> {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = (x * 7 + y) & 255;
      data[o + 1] = (x ^ y) & 255;
      data[o + 2] = ((x * y) >> 6) & 255;
      data[o + 3] = 255;
    }
  }
  const encoded = await encodeJpeg({ data, width, height, colorSpace: "srgb" }, { quality: 85 });
  return new Uint8Array(encoded);
}
