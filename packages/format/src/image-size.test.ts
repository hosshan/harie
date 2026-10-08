import { describe, expect, it } from "vitest";
import { readImageSize } from "./image-size";
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
