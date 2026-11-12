import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import {
  createWasmDecoder,
  ImportImageError,
  type LibHeif,
  svgTargetWidth,
  uncompressedPng,
} from "./import";
import type { ImportedImage } from "./renderer";
import { fixture, nodeRenderer } from "./test-utils/node-renderer";

const require = createRequire(import.meta.url);

const decode = createWasmDecoder({
  webp: async () =>
    WebAssembly.compile(readFileSync(require.resolve("@jsquash/webp/codec/dec/webp_dec.wasm"))),
  heic: async () =>
    (await import("libheif-js/libheif-wasm/libheif-bundle.mjs")).default() as LibHeif,
});

/** 変換結果を描き直したピクセルから (x, y) の色を読む */
async function pixelAt(img: ImportedImage, x: number, y: number) {
  const r = await nodeRenderer();
  const px = r.renderPixels({
    doc: createDocument({ width: img.width, height: img.height }),
    base: img,
  });
  const o = (y * px.width + x) * 4;
  return [px.data[o], px.data[o + 1], px.data[o + 2]] as number[];
}

const near = (actual: number[], expected: number[], tolerance = 24) =>
  actual.every((v, i) => Math.abs(v - (expected[i] as number)) <= tolerance);

describe("importImage", () => {
  it.each([
    ["gif", "image/png"],
    ["webp", "image/png"],
    ["heic", "image/jpeg"],
  ] as const)("FR-FILE-15: %s を %s に変換し、色と大きさを保つ", async (type, mediaType) => {
    const r = await nodeRenderer();
    const img = await r.importImage({ bytes: fixture(`import/sample.${type}`), type, decode });
    expect(img.mediaType).toBe(mediaType);
    expect([img.width, img.height]).toEqual([64, 48]);
    expect(near(await pixelAt(img, 8, 24), [220, 40, 40])).toBe(true);
    expect(near(await pixelAt(img, 48, 8), [40, 90, 220])).toBe(true);
  });

  it("FR-FILE-15: 透過部分は白地に合成する", async () => {
    const r = await nodeRenderer();
    const img = await r.importImage({ bytes: fixture("import/sample.webp"), type: "webp", decode });
    expect(near(await pixelAt(img, 48, 40), [255, 255, 255], 2)).toBe(true);
  });

  it("FR-FILE-15: 小さい SVG は長辺 1024px まで拡大して PNG にする", async () => {
    const r = await nodeRenderer();
    const img = await r.importImage({ bytes: fixture("import/sample.svg"), type: "svg" });
    expect(img.mediaType).toBe("image/png");
    expect([img.width, img.height]).toEqual([1024, 768]);
    expect(near(await pixelAt(img, 100, 400), [220, 40, 40], 2)).toBe(true);
    expect(near(await pixelAt(img, 800, 100), [40, 90, 220], 2)).toBe(true);
  });

  it("FR-FILE-15: 同じ SVG からは同じバイト列になる（決定的）", async () => {
    const r = await nodeRenderer();
    const a = await r.importImage({ bytes: fixture("import/sample.svg"), type: "svg" });
    const b = await r.importImage({ bytes: fixture("import/sample.svg"), type: "svg" });
    expect(a.bytes).toEqual(b.bytes);
  });

  it("FR-FILE-15: デコーダが読めない形式（Node の AVIF）は unsupported、壊れた SVG は decode-failed", async () => {
    const r = await nodeRenderer();
    await expect(
      r.importImage({ bytes: fixture("import/sample.avif"), type: "avif", decode }),
    ).rejects.toMatchObject({ reason: "unsupported" });
    await expect(
      r.importImage({ bytes: new TextEncoder().encode("<svg"), type: "svg" }),
    ).rejects.toBeInstanceOf(ImportImageError);
  });
});

describe("svgTargetWidth", () => {
  it("FR-FILE-15: 長辺 1024px 未満は拡大し、8192px を超えるものは縮める", () => {
    expect(svgTargetWidth(64, 48)).toBe(1024);
    expect(svgTargetWidth(1600, 900)).toBe(1600);
    expect(svgTargetWidth(20000, 10000)).toBe(8192);
  });
});

describe("uncompressedPng", () => {
  it("FR-FILE-15: 65535 バイトを超える画像も stored ブロックに分けて書ける", async () => {
    const width = 200;
    const height = 120;
    const data = new Uint8Array(width * height * 4).fill(128);
    const png = uncompressedPng({ width, height, data });
    const r = await nodeRenderer();
    const px = r.renderPixels({
      doc: createDocument({ width, height }),
      base: { bytes: png, mediaType: "image/png" },
    });
    expect(px.width).toBe(width);
    expect(px.data[(60 * width + 100) * 4 + 3]).toBe(255);
  });
});
