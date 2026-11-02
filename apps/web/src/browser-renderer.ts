// ブラウザで描画に必要な WASM とフォントを読み込む。描画そのものは @harie/render（全環境共通、ADR-0005）

import regularFontUrl from "@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf?url";
import boldFontUrl from "@expo-google-fonts/noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf?url";
import { createRenderer, type ExtraFont, type Renderer } from "@harie/render";
import hangulRegularUrl from "@harie/render/fonts/NotoSansKR-Hangul-400.ttf?url";
import hangulBoldUrl from "@harie/render/fonts/NotoSansKR-Hangul-700.ttf?url";
import scRegularUrl from "@harie/render/fonts/NotoSansSC-Supplement-400.ttf?url";
import scBoldUrl from "@harie/render/fonts/NotoSansSC-Supplement-700.ttf?url";
import jpegEncoderUrl from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url";
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";

export { boldFontUrl, regularFontUrl };

/** 補助フォント（ADR-0013）の URL。ハングル・Noto Sans JP にない簡体字が注釈に現れたときだけ読み込む */
export const extraFontUrls: Record<ExtraFont, { regular: string; bold: string }> = {
  hangul: { regular: hangulRegularUrl, bold: hangulBoldUrl },
  "simplified-chinese": { regular: scRegularUrl, bold: scBoldUrl },
};

async function bytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} を読み込めません（${res.status}）`);
  return new Uint8Array(await res.arrayBuffer());
}

let renderer: Promise<Renderer> | undefined;

/** 初回の保存時に読み込む（WASM とフォントで数 MB あるため、開くだけなら読まない） */
export function browserRenderer(): Promise<Renderer> {
  renderer ??= (async () => {
    const [resvgWasm, jpegEncoder, regular, bold] = await Promise.all([
      bytes(resvgWasmUrl),
      bytes(jpegEncoderUrl),
      bytes(regularFontUrl),
      bytes(boldFontUrl),
    ]);
    return createRenderer({
      resvgWasm,
      jpegEncoderWasm: await WebAssembly.compile(jpegEncoder as Uint8Array<ArrayBuffer>),
      fonts: [regular, bold],
      loadExtraFont: (font) =>
        Promise.all([bytes(extraFontUrls[font].regular), bytes(extraFontUrls[font].bold)]),
    });
  })();
  renderer.catch(() => {
    renderer = undefined;
  });
  return renderer;
}
