import { readAnoi, writeAnoi } from "@anoi/format";
import { applyOps, createDocument, type PiiMask, recordPiiApplied } from "@anoi/model";
import { describe, expect, it } from "vitest";
import { blockSize, DEFAULT_FILL, MIN_MOSAIC_BLOCK, snapRect } from "./mask";
import type { BaseImage, Pixels } from "./renderer";
import { fixture, nodeRenderer } from "./test-utils/node-renderer";

const W = 480;
const H = 120;
// 架空の値（実在の個人情報は使わない）
const SECRET_A = "山田太郎 taro@example.com";
const SECRET_B = "佐藤花子 hanako@example.com";
const PII_RECT = { x: 15.5, y: 35.2, w: 420, h: 36 };

function doc(annotations: unknown[] = []) {
  const d = createDocument({
    width: W,
    height: H,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-10-07T00:00:00Z"),
  });
  const r = applyOps(
    d,
    annotations.map((annotation) => ({ op: "add", annotation })),
  );
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** 個人情報らしき文字が写った「スクリーンショット」を作る */
async function screenshot(secret: string, output: "png" | "jpeg" = "png"): Promise<BaseImage> {
  const r = await nodeRenderer();
  const bytes = await r.render({
    doc: doc([{ id: "t", type: "text", x: 20, y: 40, text: secret }]),
    base: { bytes: fixture("base.png"), mediaType: "image/png" },
    output,
  });
  return { bytes, mediaType: output === "png" ? "image/png" : "image/jpeg" };
}

async function pixels(base: BaseImage): Promise<Pixels> {
  return (await nodeRenderer()).renderPixels({ doc: doc(), base });
}

async function mask(base: BaseImage, masks: PiiMask[]) {
  return (await nodeRenderer()).applyMasks({ base, width: W, height: H, masks });
}

function region(px: Pixels, r: { x: number; y: number; w: number; h: number }): number[] {
  const out: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const o = (y * px.width + x) * 4;
      out.push(px.data[o] as number, px.data[o + 1] as number, px.data[o + 2] as number);
    }
  }
  return out;
}

const snapped = { x: 15, y: 35, w: 421, h: 37 };

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

describe("snapRect / blockSize", () => {
  it("範囲を整数ピクセルの外側に広げ、画像内に切り詰める", () => {
    expect(snapRect(PII_RECT, W, H)).toEqual(snapped);
    expect(snapRect({ x: -10, y: 100, w: 50, h: 50 }, W, H)).toEqual({
      x: 0,
      y: 100,
      w: 40,
      h: 20,
    });
    expect(snapRect({ x: 600, y: 0, w: 10, h: 10 }, W, H)).toBeNull();
  });

  it("ブロックは最小 16px で、範囲が大きいほど粗い", () => {
    expect(blockSize({ x: 0, y: 0, w: 300, h: 30 }, "mosaic")).toBe(MIN_MOSAIC_BLOCK);
    expect(blockSize({ x: 0, y: 0, w: 400, h: 400 }, "mosaic")).toBe(50);
    expect(blockSize({ x: 0, y: 0, w: 400, h: 400 }, "blur")).toBe(100);
  });
});

describe("applyMasks（ADR-0007）", () => {
  it("FR-EDIT-05, FR-PII-03: 塗りつぶしは範囲内をすべて指定色にする", async () => {
    const out = await mask(await screenshot(SECRET_A), [
      { kind: "email", method: "fill", rect: PII_RECT },
    ]);
    const values = new Set(region(await pixels(out.base), snapped));
    const fill = Number.parseInt(DEFAULT_FILL.slice(1), 16);
    expect([...values].sort()).toEqual([fill >> 16, (fill >> 8) & 255, fill & 255].sort());
    expect(out.applied).toEqual([{ kind: "email", method: "fill", rect: snapped }]);
  });

  it("FR-PII-03: モザイクは各ブロックが単色になる", async () => {
    const out = await mask(await screenshot(SECRET_A), [
      { kind: "name", method: "mosaic", rect: PII_RECT },
    ]);
    const px = await pixels(out.base);
    const block = blockSize(snapped, "mosaic");
    for (let y = snapped.y; y < snapped.y + snapped.h; y += block) {
      for (let x = snapped.x; x < snapped.x + snapped.w; x += block) {
        const cell = {
          x,
          y,
          w: Math.min(block, snapped.x + snapped.w - x),
          h: Math.min(block, snapped.y + snapped.h - y),
        };
        const v = region(px, cell);
        const first = v.slice(0, 3).join();
        for (let i = 0; i < v.length; i += 3) expect(v.slice(i, i + 3).join()).toBe(first);
      }
    }
  });

  it("NFR-SEC-02: 塗りつぶし・ダミー置換の結果は、範囲内の元の内容に一切依存しない", async () => {
    const [a, b] = [await screenshot(SECRET_A), await screenshot(SECRET_B)];
    for (const m of [
      { kind: "email", method: "fill", rect: PII_RECT },
      { kind: "email", method: "replace", rect: PII_RECT, replacement: "user@example.com" },
    ] as PiiMask[]) {
      const [ma, mb] = [await mask(a, [m]), await mask(b, [m])];
      expect(ma.base.bytes, m.method).toEqual(mb.base.bytes);
    }
  });

  it("NFR-SEC-02: ぼかしの結果は、範囲内のブロック平均だけで決まる（細部は復元できない）", async () => {
    const a = await screenshot(SECRET_A);
    // a と同じブロック平均を持ち、細部が異なる画像（a をモザイクにしたもの）
    const averaged = (await mask(a, [{ kind: "name", method: "mosaic", rect: PII_RECT }])).base;
    expect(blockSize(snapped, "blur")).toBe(blockSize(snapped, "mosaic"));
    const blur: PiiMask = { kind: "name", method: "blur", rect: PII_RECT };
    const [fromA, fromAveraged] = [await mask(a, [blur]), await mask(averaged, [blur])];
    expect(region(await pixels(fromA.base), snapped)).toEqual(
      region(await pixels(fromAveraged.base), snapped),
    );
    // 元の範囲とは違う絵になっている
    expect(region(await pixels(fromA.base), snapped)).not.toEqual(region(await pixels(a), snapped));
  });

  it("FR-PII-02: ダミー置換は元の文字を消してダミーの文字を描く", async () => {
    const a = await screenshot(SECRET_A);
    const erased = await mask(a, [{ kind: "email", method: "replace", rect: PII_RECT }]);
    const replaced = await mask(a, [
      { kind: "email", method: "replace", rect: PII_RECT, replacement: "user@example.com" },
    ]);
    // 置換文字なし → 周囲の背景色で塗るだけ（単色）
    expect(
      new Set(
        region(await pixels(erased.base), snapped)
          .join()
          .match(/\d+,\d+,\d+/g),
      ).size,
    ).toBeLessThanOrEqual(1);
    expect(region(await pixels(replaced.base), snapped)).not.toEqual(
      region(await pixels(erased.base), snapped),
    );
  });

  it("範囲の外のピクセルは変えない（PNG）", async () => {
    const a = await screenshot(SECRET_A);
    const out = await mask(a, [{ kind: "email", method: "fill", rect: PII_RECT }]);
    const [before, after] = [await pixels(a), await pixels(out.base)];
    const above = { x: 0, y: 0, w: W, h: snapped.y };
    const below = { x: 0, y: snapped.y + snapped.h, w: W, h: H - snapped.y - snapped.h };
    expect(region(after, above)).toEqual(region(before, above));
    expect(region(after, below)).toEqual(region(before, below));
  });

  it("画像の外の指示は無視し、記録もしない", async () => {
    const out = await mask(await screenshot(SECRET_A), [
      { kind: "other", method: "fill", rect: { x: 1000, y: 0, w: 10, h: 10 } },
    ]);
    expect(out.applied).toEqual([]);
  });

  it.each(["png", "jpeg"] as const)(
    "NFR-SEC-02, FR-PII-04: 保存したファイル（%s）に加工前のベース画像も元の文字も残らない",
    async (format) => {
      const original = await screenshot(SECRET_A, format);
      const out = await mask(original, [
        { kind: "email", method: "replace", rect: PII_RECT, replacement: "user@example.com" },
      ]);
      expect(out.base.mediaType).toBe(original.mediaType);
      const d = recordPiiApplied(doc(), out.applied);
      const rendered = await (await nodeRenderer()).render({
        doc: d,
        base: out.base,
        output: format,
      });
      const file = writeAnoi({ doc: d, base: out.base.bytes, rendered });

      expect(indexOfBytes(file, original.bytes)).toBe(-1);
      const text = new TextDecoder("latin1").decode(file);
      for (const s of ["taro@example.com", "user@example.com"]) expect(text).not.toContain(s);

      const read = readAnoi(file);
      expect(read.kind).toBe("anoi");
      if (read.kind !== "anoi") return;
      expect(read.base).toEqual(out.base);
      expect(read.doc.pii.applied).toEqual([{ kind: "email", method: "replace", rect: snapped }]);
    },
  );
});
