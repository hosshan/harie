import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sniffImageType } from "./image-type";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
const text = (s: string) => new TextEncoder().encode(s);

describe("sniffImageType", () => {
  it.each([
    ["base.jpg", "jpeg"],
    ["base.png", "png"],
    ["import/sample.svg", "svg"],
    ["import/sample.gif", "gif"],
    ["import/sample.webp", "webp"],
    ["import/sample.bmp", "bmp"],
    ["import/sample.avif", "avif"],
    ["import/sample.heic", "heic"],
  ])("FR-FILE-15: %s を %s と判定する", (name, type) => {
    expect(sniffImageType(fixture(name))).toBe(type);
  });

  it("FR-FILE-15: XML 宣言・コメント・DOCTYPE の後の svg 要素を SVG と判定する", () => {
    expect(
      sniffImageType(
        text(
          '﻿<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<!-- c -->\n<svg width="1" height="1"/>',
        ),
      ),
    ).toBe("svg");
  });

  it("FR-FILE-15: svg 以外の XML・HTML・空・未知の形式は null", () => {
    expect(sniffImageType(text("<html><svg></svg></html>"))).toBeNull();
    expect(sniffImageType(text('<?xml version="1.0"?><root/>'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
    expect(sniffImageType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});
