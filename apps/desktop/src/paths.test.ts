import { describe, expect, it } from "vitest";
import { baseName, isImagePath, siblingPath, withExtension } from "./paths";

describe("paths（NFR-PLAT-03）", () => {
  it("macOS と Windows のどちらのパスからもファイル名を取り出す", () => {
    expect(baseName("/Users/a/画面.harie.jpg")).toBe("画面.harie.jpg");
    expect(baseName("C:\\Users\\a\\screen.png")).toBe("screen.png");
    expect(baseName("screen.png")).toBe("screen.png");
  });

  it("同じフォルダーに別の名前のパスを作る", () => {
    expect(siblingPath("/Users/a/screen.png", "screen.harie.png")).toBe(
      "/Users/a/screen.harie.png",
    );
    expect(siblingPath("C:\\a\\screen.png", "screen.harie.jpg")).toBe("C:\\a\\screen.harie.jpg");
    expect(siblingPath("screen.png", "screen.harie.png")).toBe("screen.harie.png");
  });

  it("FR-FILE-15: JPEG・PNG と、変換して開ける画像を開ける画像とみなす", () => {
    expect(isImagePath("/a/b.JPG")).toBe(true);
    expect(isImagePath("/a/b.jpeg")).toBe(true);
    expect(isImagePath("/a/b.png")).toBe(true);
    expect(isImagePath("/a/b.svg")).toBe(true);
    expect(isImagePath("/a/IMG_0001.HEIC")).toBe(true);
    expect(isImagePath("/a/b.webp")).toBe(true);
    expect(isImagePath("/a/b.tiff")).toBe(false);
    expect(isImagePath("/a/b.txt")).toBe(false);
    expect(isImagePath("/a/b.png.txt")).toBe(false);
  });

  it("保存形式の拡張子がなければ足す", () => {
    expect(withExtension("/a/b", "jpeg")).toBe("/a/b.jpg");
    expect(withExtension("/a/b.JPEG", "jpeg")).toBe("/a/b.JPEG");
    expect(withExtension("/a/b.jpg", "png")).toBe("/a/b.jpg.png");
    expect(withExtension("/a/b.png", "png")).toBe("/a/b.png");
  });
});
