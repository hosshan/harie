import { describe, expect, it } from "vitest";
import { readBaseImage } from "./base-image";
import { writeHarie } from "./harie-file";
import { readImageSize } from "./image-size";
import { fixture, sampleDoc } from "./test-utils/fixtures";

describe("readBaseImage", () => {
  it("FR-EDIT-10: 普通の画像はバイト列をそのまま使う", () => {
    const bytes = fixture("base.png");
    const base = readBaseImage(bytes);
    expect(base?.bytes).toBe(bytes);
    expect(base?.mediaType).toBe("image/png");
    expect(base && { width: base.width, height: base.height }).toEqual(readImageSize(bytes));
  });

  it("FR-EDIT-10: Harie ファイルは注釈を焼き込んだ画像ではなく埋め込みのベース画像を使う", () => {
    const file = writeHarie({
      rendered: fixture("rendered.jpg"),
      base: fixture("base.jpg"),
      doc: sampleDoc(),
    });
    const base = readBaseImage(file);
    expect(base?.mediaType).toBe("image/jpeg");
    expect(base?.bytes).toEqual(fixture("base.jpg"));
  });

  it("JPEG / PNG でなければ null", () => {
    expect(readBaseImage(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
