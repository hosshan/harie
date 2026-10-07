// ブラウザで描画に必要な WASM とフォントを読み込む。描画そのものは @anoi/render（全環境共通、ADR-0005）

import { createRenderer, type Renderer } from "@anoi/render";
import regularFontUrl from "@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf?url";
import boldFontUrl from "@expo-google-fonts/noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf?url";
import jpegEncoderUrl from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url";
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";

export { boldFontUrl, regularFontUrl };

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
    });
  })();
  renderer.catch(() => {
    renderer = undefined;
  });
  return renderer;
}
