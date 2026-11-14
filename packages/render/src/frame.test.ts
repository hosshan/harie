// 保存する画像の仕上げ（FR-FILE-16 / ADR-0017）
import { applyOps, createDocument, type Frame, type HarieDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { buildFramePreview, outputArea, resolveFrame, savedImageSize } from "./frame";
import { buildSvg } from "./svg";
import { fixture, nodeRenderer } from "./test-utils/node-renderer";

function doc(width: number, height: number, frame?: Frame): HarieDocument {
  const d = createDocument({
    width,
    height,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-11-13T00:00:00Z"),
  });
  if (frame === undefined) return d;
  const r = applyOps(d, [{ op: "frame", frame }]);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const base = { bytes: fixture("base.png"), mediaType: "image/png" as const };

function px(p: { width: number; data: Uint8Array }, x: number, y: number) {
  const i = (y * p.width + x) * 4;
  return Array.from(p.data.subarray(i, i + 4));
}

describe("仕上げ FR-FILE-16", () => {
  it("何も付かない仕上げは無いのと同じ", () => {
    expect(resolveFrame(undefined)).toBeNull();
    expect(resolveFrame({ padding: 0, background: "#000000" })).toBeNull();
    expect(resolveFrame({ shadow: { blur: 0 } })).toBeNull();
  });

  it("省略を埋める（背景は白、影は下へ blur の 1/4、黒の 25%）", () => {
    expect(resolveFrame({ padding: 16, shadow: { blur: 24 } })).toEqual({
      padding: 16,
      background: "#FFFFFF",
      radius: 0,
      border: null,
      shadow: { blur: 24, y: 6, color: "#000000", opacity: 0x40 / 255 },
    });
  });

  it("保存する画像は余白の分だけ大きく、注釈の座標の範囲も外へ広がる", () => {
    const d = doc(64, 40, { padding: 10 });
    expect(savedImageSize(d)).toEqual({ width: 84, height: 60 });
    expect(outputArea(d)).toEqual({ x: -10, y: -10, w: 84, h: 60 });
    expect(outputArea(doc(64, 40))).toEqual({ x: 0, y: 0, w: 64, h: 40 });
  });

  it("buildSvg は保存用（applyOutputSize）のときだけ包む（エディタの表示は変わらない）", () => {
    const d = doc(64, 40, { padding: 10, shadow: { blur: 8 } });
    expect(buildSvg(d)).toBe(buildSvg(doc(64, 40)));
    const framed = buildSvg(d, { applyOutputSize: true });
    expect(framed).toMatch(/^<svg [^>]*width="84" height="60"/);
    expect(framed).toContain('x="10" y="10" width="64" height="40" viewBox="0 0 64 40"');
    expect(framed).toContain("feGaussianBlur");
  });

  it("余白を背景色で塗り、画像はその内側に描く", async () => {
    const r = await nodeRenderer();
    const plain = r.renderPixels({ doc: doc(64, 40), base });
    const framed = r.renderPixels({
      doc: doc(64, 40, { padding: 6, background: "#336699" }),
      base,
    });
    expect(framed.width).toBe(76);
    expect(framed.height).toBe(52);
    expect(px(framed, 2, 2)).toEqual([0x33, 0x66, 0x99, 255]);
    expect(px(framed, 6 + 20, 6 + 20)).toEqual(px(plain, 20, 20));
  });

  it("atOutputSize: false なら仕上げを付けない（AI に見せる画像など）", async () => {
    const r = await nodeRenderer();
    const p = r.renderPixels({ doc: doc(64, 40, { padding: 6 }), base, atOutputSize: false });
    expect([p.width, p.height]).toEqual([64, 40]);
  });

  it("影は画像の下側の余白に落ちる", async () => {
    const r = await nodeRenderer();
    const p = r.renderPixels({
      doc: doc(64, 40, { padding: 16, shadow: { blur: 8, y: 4 } }),
      base,
    });
    const below = px(p, 16 + 32, 16 + 40 + 3);
    expect(below[0]).toBeLessThan(250);
    expect(px(p, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  it("線は画像の縁の内側に引く", async () => {
    const r = await nodeRenderer();
    const p = r.renderPixels({
      doc: doc(64, 40, { padding: 4, border: { width: 2, color: "#FF0000" } }),
      base,
    });
    expect(px(p, 4, 20)).toEqual([255, 0, 0, 255]);
    expect(px(p, 2, 20)).toEqual([255, 255, 255, 255]);
  });

  it("角丸の外側は背景色になる", async () => {
    const r = await nodeRenderer();
    const p = r.renderPixels({
      doc: doc(64, 40, { padding: 4, radius: 12, background: "#000000" }),
      base,
    });
    expect(px(p, 4, 4)).toEqual([0, 0, 0, 255]);
  });

  it("背景を透過にすると、PNG では余白が透明になり、画像の部分は不透明のまま", async () => {
    const r = await nodeRenderer();
    const d = doc(64, 40, { padding: 6, background: "transparent" });
    const p = r.renderPixels({ doc: d, base });
    expect(px(p, 1, 1)[3]).toBe(0);
    expect(px(p, 30, 20)[3]).toBe(255);
    // JPEG は透過できないので白地に描く（エンコードできることだけ確かめる）
    const jpeg = await r.render({ doc: d, base, output: "jpeg" });
    expect(jpeg.length).toBeGreaterThan(0);
  });

  it("エディタ用の表示は、画像の下（背景・影）と上（線）に分ける", () => {
    const shadowOnly = buildFramePreview(doc(64, 40, { padding: 8, shadow: { blur: 8 } }));
    expect(shadowOnly?.over).toBeNull();
    expect(shadowOnly?.under).toContain('id="harie-frame-preview-shadow"');
    const bordered = buildFramePreview(doc(64, 40, { border: { width: 1 } }));
    expect(bordered?.over).toContain('stroke="#D4D4D8"');
    expect(buildFramePreview(doc(64, 40))).toBeNull();
  });
});

describe("書き出しの大きさ（FR-EDIT-24）と仕上げ", () => {
  it("書き出しを縮めると、仕上げも同じ倍率で縮めて外側に付ける（ADR-0018）", async () => {
    const d = doc(64, 40, { padding: 10, background: "#336699" });
    const r0 = applyOps(d, [{ op: "setOutputSize", size: { width: 32, height: 20 } }]);
    if (!r0.ok) throw new Error(r0.error.message);
    expect(savedImageSize(r0.value)).toEqual({ width: 42, height: 30 });
    const r = await nodeRenderer();
    const p = r.renderPixels({ doc: r0.value, base });
    expect([p.width, p.height]).toEqual([42, 30]);
    expect(px(p, 2, 2)).toEqual([0x33, 0x66, 0x99, 255]);
  });
});
