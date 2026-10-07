/// <reference path="./wasm.d.ts" />
// SVG → ピクセル → JPEG / PNG（ADR-0005）
// WASM とフォントの読み込み方法は環境（ブラウザ・拡張・Node）ごとに違うため、呼び出し側から受け取る。
// 描画そのものは全環境で同じコードが走る（NFR-PLAT-05）。
import type { AnoiDocument, PiiApplied, PiiMask } from "@anoi/model";
import encodeJpeg, { init as initJpegEncoder } from "@jsquash/jpeg/encode.js";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { toDataUri } from "./base64";
import { planMasks } from "./mask";
import { buildSvg, FONT_FAMILY } from "./svg";

export type WasmSource = Uint8Array | ArrayBuffer | WebAssembly.Module;

export type RendererInit = {
  /** `@resvg/resvg-wasm/index_bg.wasm` */
  resvgWasm: WasmSource;
  /** `@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm` をコンパイルした Module */
  jpegEncoderWasm: WebAssembly.Module;
  /** Noto Sans JP（TTF/OTF）。Regular と Bold を渡す */
  fonts: Uint8Array[];
};

export type OutputFormat = "jpeg" | "png";

export type RenderInput = {
  doc: AnoiDocument;
  base: BaseImage;
  output: OutputFormat;
  /** JPEG 品質（1〜100）。既定 90 */
  quality?: number;
  includeSuggested?: boolean;
};

export type Pixels = { width: number; height: number; data: Uint8Array };

export type BaseImage = { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" };

export type MaskInput = {
  /** 加工前のベース画像。canvas と同じ大きさで扱う */
  base: BaseImage;
  width: number;
  height: number;
  masks: readonly PiiMask[];
};

export type MaskOutput = {
  /** 加工後のベース画像（元と同じ形式で再エンコードしたもの）。以後はこれをベースにし、加工前のバイト列は捨てる */
  base: BaseImage;
  /** `doc.pii.applied` に追記する記録 */
  applied: PiiApplied[];
};

export type Renderer = {
  /** RGBA ピクセルを返す。テストとエディタのプレビュー用 */
  renderPixels(input: Omit<RenderInput, "output" | "quality">): Pixels;
  /** 保存用のレンダリング画像（format パッケージで埋め込む前のもの）を返す */
  render(input: RenderInput): Promise<Uint8Array>;
  /** PII 加工をベース画像に不可逆に適用する（ADR-0007） */
  applyMasks(input: MaskInput): Promise<MaskOutput>;
};

let resvgReady: Promise<void> | undefined;

/** resvg の WASM はプロセス内で 1 回しか初期化できないので共有する。 */
function ensureResvg(source: WasmSource): Promise<void> {
  resvgReady ??= initWasm(source);
  return resvgReady;
}

export async function createRenderer(init: RendererInit): Promise<Renderer> {
  await ensureResvg(init.resvgWasm);
  await initJpegEncoder(init.jpegEncoderWasm);
  const fontBuffers = init.fonts;

  const rasterizeSvg = (svg: string) => {
    const resvg = new Resvg(svg, {
      font: { fontBuffers, defaultFontFamily: FONT_FAMILY, sansSerifFamily: FONT_FAMILY },
      // 背景は不透明の白。透過 PNG のベース画像でも JPEG と同じ見た目にする
      background: "#FFFFFF",
    });
    try {
      return resvg.render();
    } finally {
      resvg.free();
    }
  };

  const rasterize = (input: Omit<RenderInput, "output" | "quality">) =>
    rasterizeSvg(
      buildSvg(input.doc, {
        baseImageHref: toDataUri(input.base.bytes, input.base.mediaType),
        includeSuggested: input.includeSuggested ?? false,
      }),
    );

  const encode = async (
    img: ReturnType<typeof rasterizeSvg>,
    output: OutputFormat,
    quality: number,
  ) => {
    if (output === "png") return img.asPng();
    const pixels = img.pixels;
    const encoded = await encodeJpeg(
      {
        data: new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.length),
        width: img.width,
        height: img.height,
        colorSpace: "srgb",
      },
      // 速度優先: プログレッシブを切る（NFR-PERF-01）
      { quality, progressive: false },
    );
    return new Uint8Array(encoded);
  };

  return {
    renderPixels(input) {
      const img = rasterize(input);
      try {
        return { width: img.width, height: img.height, data: img.pixels.slice() };
      } finally {
        img.free();
      }
    },
    async render(input) {
      const img = rasterize(input);
      try {
        return await encode(img, input.output, input.quality ?? 90);
      } finally {
        img.free();
      }
    },
    async applyMasks(input) {
      const href = toDataUri(input.base.bytes, input.base.mediaType);
      const { width, height } = input;
      const before = rasterizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="${href}" width="${width}" height="${height}" preserveAspectRatio="none"/></svg>`,
      );
      let plan: ReturnType<typeof planMasks>;
      try {
        plan = planMasks({ width, height, data: before.pixels }, href, input.masks);
      } finally {
        before.free();
      }
      const after = rasterizeSvg(plan.svg);
      try {
        const output = input.base.mediaType === "image/png" ? "png" : "jpeg";
        const bytes = await encode(after, output, 92);
        return { base: { bytes, mediaType: input.base.mediaType }, applied: plan.applied };
      } finally {
        after.free();
      }
    },
  };
}
