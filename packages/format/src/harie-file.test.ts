import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ascii, utf8 } from "./bytes";
import { detectFormat, readHarie, writeHarie } from "./harie-file";
import {
  DOC_ID,
  fixture,
  indexOfBytes,
  insertJpegSegment,
  lastIndexOfBytes,
  sampleDoc,
} from "./test-utils/fixtures";

const formats = [
  { name: "JPEG", rendered: "rendered.jpg", base: "base.jpg", mediaType: "image/jpeg" },
  { name: "PNG", rendered: "rendered.png", base: "base.png", mediaType: "image/png" },
] as const;

function hasImageMagick(): boolean {
  try {
    execFileSync("convert", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.each(formats)("$name", ({ rendered, base, mediaType }) => {
  const write = () =>
    writeHarie({ rendered: fixture(rendered), base: fixture(base), doc: sampleDoc() });

  it("FR-FILE-03: 書いたファイルから注釈ドキュメントとベース画像を復元できる", () => {
    const r = readHarie(write());
    expect(r.kind).toBe("harie");
    if (r.kind !== "harie") return;
    expect(r.doc).toEqual(sampleDoc());
    expect(r.base.mediaType).toBe(mediaType);
    expect(r.descriptor).toMatchObject({ formatVersion: "0.1", docId: DOC_ID, revision: 1 });
  });

  it("FR-FILE-04: ベース画像はバイト単位で同一（再エンコードしない）", () => {
    const r = readHarie(write());
    expect(r.kind === "harie" && Buffer.from(r.base.bytes).equals(Buffer.from(fixture(base)))).toBe(
      true,
    );
  });

  it("書き込みと読み込みを繰り返しても劣化しない", () => {
    let file = write();
    for (let i = 0; i < 3; i++) {
      const r = readHarie(file);
      if (r.kind !== "harie") throw new Error(r.kind);
      file = writeHarie({ rendered: fixture(rendered), base: r.base.bytes, doc: r.doc });
    }
    const r = readHarie(file);
    expect(r.kind === "harie" && Buffer.from(r.base.bytes).equals(Buffer.from(fixture(base)))).toBe(
      true,
    );
  });

  it("FR-FILE-08: 通常の画像は plain として読める", () => {
    expect(readHarie(fixture(rendered))).toEqual({
      kind: "plain",
      format: detectFormat(fixture(rendered)),
    });
  });

  it("FR-FILE-05: 画像データが外部で変更されたら RenderedImageModified（復元材料は返す）", () => {
    const file = write();
    // 末尾付近（圧縮データ内）の 1 バイトを書き換える
    const tampered = file.slice();
    const at =
      mediaType === "image/jpeg"
        ? tampered.length - 10
        : lastIndexOfBytes(tampered, ascii("IDAT")) + 6;
    tampered[at] = (tampered[at] as number) ^ 0x01;
    const r = readHarie(tampered);
    expect(r).toMatchObject({ kind: "harie-mismatch", reason: "RenderedImageModified" });
    expect(r.kind === "harie-mismatch" && r.doc?.docId).toBe(DOC_ID);
  });

  it("FR-FILE-05: 埋め込みデータが書き換えられたら PayloadCorrupted", () => {
    const file = write();
    const at = indexOfBytes(file, utf8("保存ボタン"));
    const tampered = file.slice();
    tampered.set(utf8("登録ボタン"), at);
    expect(readHarie(tampered)).toMatchObject({
      kind: "harie-mismatch",
      reason: "PayloadCorrupted",
    });
  });

  it("NFR-DATA-03: どこで切り詰めても例外を投げない", () => {
    const file = write();
    for (let len = 0; len < file.length; len += Math.max(1, Math.floor(file.length / 97))) {
      expect(() => readHarie(file.subarray(0, len))).not.toThrow();
    }
  });
});

describe("JPEG 固有", () => {
  it("64KB を超えるベース画像を複数 APP11 セグメントに分割して復元できる", () => {
    const base = fixture("large-base.jpg");
    expect(base.length).toBeGreaterThan(0xffff * 2);
    const file = writeHarie({ rendered: fixture("rendered.jpg"), base, doc: sampleDoc() });
    const r = readHarie(file);
    expect(r.kind === "harie" && Buffer.from(r.base.bytes).equals(Buffer.from(base))).toBe(true);
  });

  it("NFR-SEC: レンダリング画像の EXIF は書き出さない。ICC など他の APPn は保持する", () => {
    const exif = new Uint8Array([...ascii("Exif\0\0"), ...ascii("GPS-SECRET")]);
    const icc = new Uint8Array([...ascii("ICC_PROFILE\0"), 1, 1, ...ascii("profile")]);
    const rendered = insertJpegSegment(
      insertJpegSegment(fixture("rendered.jpg"), 0xe1, exif),
      0xe2,
      icc,
    );
    const file = writeHarie({ rendered, base: fixture("base.jpg"), doc: sampleDoc() });
    expect(indexOfBytes(file, ascii("GPS-SECRET"))).toBe(-1);
    expect(indexOfBytes(file, ascii("ICC_PROFILE"))).toBeGreaterThan(0);
    expect(readHarie(file).kind).toBe("harie");
  });

  it("C2PA 等、他者の APP11 があっても読める", () => {
    const foreign = new Uint8Array([
      ...ascii("JP"),
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      16,
      ...ascii("jumb"),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
    const file = insertJpegSegment(
      writeHarie({
        rendered: fixture("rendered.jpg"),
        base: fixture("base.jpg"),
        doc: sampleDoc(),
      }),
      0xeb,
      foreign,
    );
    expect(readHarie(file).kind).toBe("harie");
  });

  it.runIf(hasImageMagick())("外部ツールでリサイズすると不整合として検出する（PoC の再現）", () => {
    const dir = mkdtempSync(join(tmpdir(), "harie-"));
    const src = join(dir, "in.jpg");
    const out = join(dir, "out.jpg");
    writeFileSync(
      src,
      writeHarie({
        rendered: fixture("rendered.jpg"),
        base: fixture("large-base.jpg"),
        doc: sampleDoc(),
      }),
    );
    execFileSync("convert", [src, "-resize", "50%", out]);
    const r = readHarie(new Uint8Array(readFileSync(out)));
    expect(r.kind === "harie-mismatch" || r.kind === "plain", JSON.stringify(r).slice(0, 300)).toBe(
      true,
    );
  });
});

describe("入力の検証", () => {
  it("JPEG/PNG 以外は unsupported", () => {
    expect(readHarie(ascii("GIF89a"))).toEqual({ kind: "unsupported" });
    expect(() =>
      writeHarie({ rendered: ascii("GIF89a"), base: fixture("base.jpg"), doc: sampleDoc() }),
    ).toThrow();
  });

  it("不正な注釈ドキュメントは書き込まない", () => {
    const doc = { ...sampleDoc(), docId: "not-a-uuid" };
    expect(() =>
      writeHarie({ rendered: fixture("rendered.jpg"), base: fixture("base.jpg"), doc }),
    ).toThrow();
  });
});
