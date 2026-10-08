import { describe, expect, it } from "vitest";
import {
  buildFileName,
  fallbackFileStem,
  PRODUCT_MARKER,
  parseFileName,
  renameForSave,
  toFileSlug,
} from "./file-name";

describe("FR-FILE-06: 保存ファイル名の規則（ADR-0006）", () => {
  it("<名前>.<マーカー>.<拡張子> で組み立てる", () => {
    expect(buildFileName({ name: "Notification Settings", ext: "jpg" })).toBe(
      `notification-settings.${PRODUCT_MARKER}.jpg`,
    );
    expect(buildFileName({ name: "login", ext: "png" })).toBe(`login.${PRODUCT_MARKER}.png`);
  });

  it("使えない文字はハイフンにまとめ、前後のハイフンを除く", () => {
    expect(toFileSlug("  設定画面: Step {1}/2  ")).toBe("step-1-2");
    expect(toFileSlug("ＡＢＣ１２３")).toBe("abc123");
  });

  it("スラッグにできない名前は日時ベースの名前にする", () => {
    const now = new Date(2026, 9, 7, 8, 5, 9);
    expect(toFileSlug("通知設定")).toBeNull();
    expect(fallbackFileStem(now)).toBe("image-20261007-080509");
    expect(buildFileName({ name: "通知設定", ext: "jpg", now })).toBe(
      `image-20261007-080509.${PRODUCT_MARKER}.jpg`,
    );
  });

  it("規則どおりのファイル名を分解できる（.jpeg と大文字も可）", () => {
    expect(parseFileName(`a.b.${PRODUCT_MARKER}.JPEG`)).toEqual({
      stem: "a.b",
      marker: PRODUCT_MARKER,
      ext: "jpeg",
    });
  });

  it("規則外のファイル名は null", () => {
    expect(parseFileName("photo.jpg")).toBeNull();
    expect(parseFileName(`.${PRODUCT_MARKER}.jpg`)).toBeNull();
    expect(parseFileName(`a.${PRODUCT_MARKER}.gif`)).toBeNull();
    expect(parseFileName("a.other.jpg")).toBeNull();
  });

  it("旧名 anoi のファイル名も読み、再保存では新しいマーカーに付け替える", () => {
    expect(parseFileName("settings.anoi.jpg")).toEqual({
      stem: "settings",
      marker: "anoi",
      ext: "jpg",
    });
    expect(renameForSave("settings.anoi.jpg", "jpg")).toBe("settings.harie.jpg");
  });

  it("再保存時は名前を保ち、通常画像には名前から規則名を付ける", () => {
    expect(renameForSave(`settings.${PRODUCT_MARKER}.jpeg`, "png")).toBe(
      `settings.${PRODUCT_MARKER}.png`,
    );
    expect(renameForSave("Screenshot 2026-10-07.png", "png")).toBe(
      `screenshot-2026-10-07.${PRODUCT_MARKER}.png`,
    );
  });
});
