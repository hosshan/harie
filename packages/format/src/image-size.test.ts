import { describe, expect, it } from "vitest";
import { ascii, concat, u32 } from "./bytes";
import { crc32 } from "./crc32";
import { readImageDpi, readImageSize } from "./image-size";
import { fixture } from "./test-utils/fixtures";

describe("readImageSize", () => {
  it.each([
    ["base.jpg", 64, 40],
    ["base.png", 64, 40],
    ["large-base.jpg", 520, 400],
    ["v0.1/sample.harie.jpg", 64, 40],
  ])("%s の大きさを読む", (name, width, height) => {
    expect(readImageSize(fixture(name))).toEqual({ width, height });
  });

  it("画像でない・壊れた入力では null を返す", () => {
    expect(readImageSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readImageSize(fixture("base.jpg").subarray(0, 10))).toBeNull();
    expect(readImageSize(fixture("base.png").subarray(0, 20))).toBeNull();
  });
});

/** PNG の IHDR の後ろに pHYs チャンクを入れる */
function withPhys(png: Uint8Array, x: number, y: number, unit: number): Uint8Array {
  const data = concat([u32(x), u32(y), Uint8Array.of(unit)]);
  const typeAndData = concat([ascii("pHYs"), data]);
  const phys = concat([u32(data.length), typeAndData, u32(crc32(typeAndData))]);
  const ihdrEnd = 8 + 12 + 13;
  return concat([png.subarray(0, ihdrEnd), phys, png.subarray(ihdrEnd)]);
}

/** JPEG の JFIF（APP0）の密度を書き換える */
function withDensity(jpeg: Uint8Array, unit: number, x: number, y: number): Uint8Array {
  const out = jpeg.slice();
  out[13] = unit;
  out[14] = x >> 8;
  out[15] = x & 0xff;
  out[16] = y >> 8;
  out[17] = y & 0xff;
  return out;
}

describe("readImageDpi（FR-EDIT-16）", () => {
  it("PNG の pHYs（ピクセル / メートル）から dpi を読む。Mac の Retina のスクリーンショットは 144", () => {
    expect(readImageDpi(withPhys(fixture("base.png"), 5669, 5669, 1))).toBeCloseTo(144, 0);
    expect(readImageDpi(withPhys(fixture("base.png"), 2835, 2835, 1))).toBeCloseTo(72, 0);
  });

  it("JPEG の JFIF の密度から dpi を読む", () => {
    expect(readImageDpi(withDensity(fixture("base.jpg"), 1, 144, 144))).toBe(144);
    expect(readImageDpi(withDensity(fixture("base.jpg"), 2, 100, 100))).toBeCloseTo(254, 0);
  });

  it("記録がない・単位がない・縦横で違う・画像でないときは null", () => {
    expect(readImageDpi(fixture("base.png"))).toBeNull();
    expect(readImageDpi(fixture("base.jpg"))).toBeNull();
    expect(readImageDpi(withPhys(fixture("base.png"), 5669, 5669, 0))).toBeNull();
    expect(readImageDpi(withPhys(fixture("base.png"), 5669, 2835, 1))).toBeNull();
    expect(readImageDpi(withDensity(fixture("base.jpg"), 1, 144, 72))).toBeNull();
    expect(readImageDpi(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
