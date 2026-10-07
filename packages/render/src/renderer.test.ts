import { readAnoi, writeAnoi } from "@anoi/format";
import { applyOps, createDocument } from "@anoi/model";
import { describe, expect, it } from "vitest";
import { fixture, nodeRenderer, syntheticJpeg } from "./test-utils/node-renderer";

function doc(width: number, height: number, annotations: unknown[]) {
  const d = createDocument({
    width,
    height,
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

const base = { bytes: fixture("base.png"), mediaType: "image/png" as const };
const red = {
  id: "r",
  type: "rect",
  x: 8,
  y: 8,
  w: 40,
  h: 20,
  style: { stroke: "#FF0000", strokeWidth: 4 },
};

function px(p: { width: number; data: Uint8Array }, x: number, y: number) {
  const i = (y * p.width + x) * 4;
  return Array.from(p.data.subarray(i, i + 4));
}

describe("Renderer", () => {
  it("注釈をベース画像に焼き込む（枠線上は赤、枠の内側はベースのまま）", async () => {
    const r = await nodeRenderer();
    const plain = r.renderPixels({ doc: doc(64, 40, []), base });
    const drawn = r.renderPixels({ doc: doc(64, 40, [red]), base });
    expect(drawn.width).toBe(64);
    expect(drawn.height).toBe(40);
    expect(px(drawn, 8, 18)).toEqual([255, 0, 0, 255]);
    expect(px(drawn, 28, 18)).toEqual(px(plain, 28, 18));
  });

  it("NFR-PLAT-05: 同じ入力からは常に同じバイト列が出る（決定的）", async () => {
    const r = await nodeRenderer();
    const input = { doc: doc(64, 40, [red]), base, output: "jpeg" as const };
    const a = await r.render(input);
    const b = await r.render(input);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("日本語テキストを描画できる（フォントが効いている）", async () => {
    const r = await nodeRenderer();
    const text = {
      id: "t",
      type: "text",
      x: 2,
      y: 2,
      text: "保存",
      style: { fontSize: 30, color: "#000000" },
    };
    const p = r.renderPixels({ doc: doc(64, 40, [text]), base });
    const plain = r.renderPixels({ doc: doc(64, 40, []), base });
    let changed = 0;
    for (let i = 0; i < p.data.length; i += 4) if (p.data[i] !== plain.data[i]) changed++;
    expect(changed).toBeGreaterThan(100);
  });

  it.each(["jpeg", "png"] as const)(
    "%s で出力し、format で埋め込んで読み戻せる",
    async (output) => {
      const r = await nodeRenderer();
      const d = doc(64, 40, [red]);
      const rendered = await r.render({ doc: d, base, output });
      const file = writeAnoi({ rendered, base: base.bytes, doc: d });
      const read = readAnoi(file);
      expect(read.kind).toBe("anoi");
      expect(read.kind === "anoi" && read.format).toBe(output);
    },
  );

  it("NFR-PERF-01: 2560×1600 の保存（描画＋JPEG 化）の所要時間を記録する", async () => {
    const r = await nodeRenderer();
    const annotations = Array.from({ length: 10 }, (_, i) => [
      { id: `r${i}`, type: "rect", x: 100 + i * 200, y: 100 + i * 100, w: 300, h: 120 },
      {
        id: `c${i}`,
        type: "callout",
        x: 120 + i * 200,
        y: 260 + i * 100,
        w: 360,
        text: `手順 ${i + 1}: 保存ボタンを押してください`,
      },
    ]).flat();
    // ベース画像はキャンバスと同じ大きさ（実際の保存と同じ条件。拡大を挟むと描画が数倍遅くなる）
    const big = { bytes: await syntheticJpeg(2560, 1600), mediaType: "image/jpeg" as const };
    const target = doc(2560, 1600, annotations);
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      const rendered = await r.render({ doc: target, base: big, output: "jpeg" });
      writeAnoi({ doc: target, base: big.bytes, rendered });
      times.push(performance.now() - t);
    }
    const ms = Math.min(...times);
    console.info(
      `NFR-PERF-01: 2560x1600 render+jpeg+embed = ${times.map(Math.round).join(", ")}ms`,
    );
    // CI のマシン差を考慮した上限。目標の 2 秒に対する計測値は docs/02-research/rendering-performance.md で管理する
    expect(ms).toBeLessThan(10_000);
  }, 20_000);
});
