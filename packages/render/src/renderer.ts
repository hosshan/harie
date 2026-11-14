/// <reference path="./wasm.d.ts" />
// SVG → ピクセル → JPEG / PNG（ADR-0005）
// WASM とフォントの読み込み方法は環境（ブラウザ・拡張・Node）ごとに違うため、呼び出し側から受け取る。
// 描画そのものは全環境で同じコードが走る（NFR-PLAT-05）。
import type { HarieDocument, PiiApplied, PiiMask } from "@harie/model";
import encodeJpeg, { init as initJpegEncoder } from "@jsquash/jpeg/encode.js";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { toDataUri } from "./base64";
import { type ExtraFont, requiredExtraFonts } from "./extra-fonts";
import { resolveFrame } from "./frame";
import {
  type ConvertibleType,
  flattenOnWhite,
  gifSize,
  type ImageDecoder,
  ImportImageError,
  importedMediaType,
  MAX_IMPORT_SIDE,
  type RgbaImage,
  svgTargetWidth,
  uncompressedPng,
} from "./import";
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
  /**
   * 補助フォント（ハングル・簡体字。ADR-0013）を読み込む。注釈にその文字が現れたときだけ呼ばれる。
   * 省略すると補助フォントは使わない（その文字は □ で描かれる）
   */
  loadExtraFont?: (font: ExtraFont) => Promise<Uint8Array[]>;
};

export type OutputFormat = "jpeg" | "png";

export type RenderInput = {
  doc: HarieDocument;
  base: BaseImage;
  output: OutputFormat;
  /** JPEG 品質（1〜100）。既定 90 */
  quality?: number;
  includeSuggested?: boolean;
  /**
   * 書き出しの大きさ（FR-EDIT-24）で描き、仕上げ（FR-FILE-16）を付けるか。既定 true（保存・コピーする画像）。
   * false はベース画像と同じ大きさで、仕上げも付けずに描く（注釈の座標と画像のピクセルを合わせて見せたいとき。MCP のプレビュー）
   */
  atOutputSize?: boolean;
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

export type ImportInput = {
  bytes: Uint8Array;
  /** 中身から判定した形式（@harie/format の sniffImageType） */
  type: ConvertibleType;
  /** SVG・GIF 以外を読むデコーダ */
  decode?: ImageDecoder;
};

/** 変換したベース画像と、その大きさ */
export type ImportedImage = BaseImage & { width: number; height: number };

export type Renderer = {
  /** RGBA ピクセルを返す。テストとエディタのプレビュー用 */
  /** 同期で描くため、補助フォントは読み込み済みのものだけを使う（render / applyMasks は読み込みを待つ） */
  renderPixels(input: Omit<RenderInput, "output" | "quality">): Pixels;
  /** 保存用のレンダリング画像（format パッケージで埋め込む前のもの）を返す */
  render(input: RenderInput): Promise<Uint8Array>;
  /** PII 加工をベース画像に不可逆に適用する（ADR-0007） */
  applyMasks(input: MaskInput): Promise<MaskOutput>;
  /**
   * JPEG / PNG 以外の画像を、ベース画像にする JPEG / PNG に変換する（FR-FILE-15, ADR-0016）。
   * SVG と GIF（最初のコマ）は resvg で描く。それ以外は `decode` でピクセルにしてから描き直す。
   * 透過部分は白地に合成する（保存時の描画と同じ見た目）。読めないときは ImportImageError を投げる
   */
  importImage(input: ImportInput): Promise<ImportedImage>;
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
  const fontBuffers = [...init.fonts];
  const extraFonts = new Map<ExtraFont, Promise<void>>();

  /** SVG に含まれる文字に要る補助フォントを読み込み、以後の描画で使う */
  const ensureFonts = async (svg: string) => {
    const load = init.loadExtraFont;
    if (!load) return;
    await Promise.all(
      requiredExtraFonts(svg).map((font) => {
        let p = extraFonts.get(font);
        if (!p) {
          p = load(font).then((buffers) => {
            fontBuffers.push(...buffers);
          });
          // 読み込みに失敗したら次の描画でやり直す
          p.catch(() => extraFonts.delete(font));
          extraFonts.set(font, p);
        }
        return p;
      }),
    );
  };

  const rasterizeSvg = (svg: string, width?: number, transparent = false) => {
    const resvg = new Resvg(svg, {
      font: { fontBuffers, defaultFontFamily: FONT_FAMILY, sansSerifFamily: FONT_FAMILY },
      // 背景は不透明の白。透過 PNG のベース画像でも JPEG と同じ見た目にする。
      // 仕上げの余白を透過にしたときだけ（PNG）、背景を塗らない（画像の部分は仕上げが白地を敷く）
      ...(transparent ? {} : { background: "#FFFFFF" }),
      ...(width === undefined ? {} : { fitTo: { mode: "width" as const, value: width } }),
    });
    try {
      return resvg.render();
    } finally {
      resvg.free();
    }
  };

  const toSvg = (input: Omit<RenderInput, "output" | "quality">) =>
    buildSvg(input.doc, {
      baseImageHref: toDataUri(input.base.bytes, input.base.mediaType),
      includeSuggested: input.includeSuggested ?? false,
      // 保存・コピーする画像は書き出しの大きさで描く（FR-EDIT-24）
      applyOutputSize: input.atOutputSize ?? true,
    });

  /** 仕上げの余白を透過にしていて、透過を残せる形式か */
  const transparentFrame = (input: Omit<RenderInput, "quality">) =>
    input.output === "png" &&
    (input.atOutputSize ?? true) &&
    resolveFrame(input.doc.frame)?.background === null;

  const encode = async (
    img: ReturnType<typeof rasterizeSvg>,
    output: OutputFormat,
    quality: number,
  ) => {
    if (output === "png") return img.asPng();
    const pixels = img.pixels;
    const encoded = await encodeJpeg(
      {
        // resvg の出力は通常の ArrayBuffer（SharedArrayBuffer ではない）。DOM の型に合わせて明示する
        data: new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.length),
        width: img.width,
        height: img.height,
        colorSpace: "srgb",
      },
      // 速度優先: プログレッシブを切る（NFR-PERF-01）
      { quality, progressive: false },
    );
    return new Uint8Array(encoded);
  };

  /** ラスタ画像を同じ大きさの SVG に貼って描き、指定の形式にする */
  const reencode = async (
    href: string,
    size: { width: number; height: number },
    mediaType: BaseImage["mediaType"],
  ): Promise<ImportedImage> => {
    const { width, height } = size;
    const img = rasterizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="${href}" width="${width}" height="${height}" preserveAspectRatio="none"/></svg>`,
    );
    try {
      const bytes = await encode(img, mediaType === "image/png" ? "png" : "jpeg", 92);
      return { bytes, mediaType, width: img.width, height: img.height };
    } finally {
      img.free();
    }
  };

  const fromPixels = async (pixels: RgbaImage, type: ConvertibleType): Promise<ImportedImage> => {
    const { width, height } = pixels;
    if (width > MAX_IMPORT_SIDE || height > MAX_IMPORT_SIDE) {
      throw new ImportImageError("too-large", `画像が大きすぎます（${width}×${height}）`);
    }
    const mediaType = importedMediaType(type);
    if (mediaType === "image/jpeg") {
      const data = flattenOnWhite(pixels);
      const encoded = await encodeJpeg(
        { data, width, height, colorSpace: "srgb" },
        { quality: 92, progressive: false },
      );
      return { bytes: new Uint8Array(encoded), mediaType, width, height };
    }
    return reencode(toDataUri(uncompressedPng(pixels), "image/png"), pixels, mediaType);
  };

  return {
    async importImage({ bytes, type, decode }) {
      if (type === "svg") {
        const svg = new TextDecoder().decode(bytes);
        let natural: { width: number; height: number };
        try {
          const probe = new Resvg(svg);
          natural = { width: probe.width, height: probe.height };
          probe.free();
        } catch (e) {
          throw new ImportImageError("decode-failed", `SVG を読めません（${String(e)}）`);
        }
        await ensureFonts(svg);
        const img = rasterizeSvg(svg, svgTargetWidth(natural.width, natural.height));
        try {
          return {
            bytes: img.asPng(),
            mediaType: "image/png",
            width: img.width,
            height: img.height,
          };
        } finally {
          img.free();
        }
      }
      if (type === "gif") {
        const size = gifSize(bytes);
        if (size.width > MAX_IMPORT_SIDE || size.height > MAX_IMPORT_SIDE) {
          throw new ImportImageError(
            "too-large",
            `画像が大きすぎます（${size.width}×${size.height}）`,
          );
        }
        return reencode(toDataUri(bytes, "image/gif"), size, "image/png");
      }
      let pixels: RgbaImage | null = null;
      try {
        pixels = decode === undefined ? null : await decode(bytes, type);
      } catch (e) {
        throw new ImportImageError(
          "decode-failed",
          `${type.toUpperCase()} を読めません（${String(e)}）`,
        );
      }
      if (pixels === null) {
        throw new ImportImageError(
          "unsupported",
          `この環境では ${type.toUpperCase()} を読めません`,
        );
      }
      return fromPixels(pixels, type);
    },
    renderPixels(input) {
      const img = rasterizeSvg(
        toSvg(input),
        undefined,
        transparentFrame({ ...input, output: "png" }),
      );
      try {
        return { width: img.width, height: img.height, data: img.pixels.slice() };
      } finally {
        img.free();
      }
    },
    async render(input) {
      const svg = toSvg(input);
      await ensureFonts(svg);
      const img = rasterizeSvg(svg, undefined, transparentFrame(input));
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
      await ensureFonts(plan.svg);
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
