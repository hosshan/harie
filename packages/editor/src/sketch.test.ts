import { applyOps, createDocument, type Point } from "@harie/model";
import { describe, expect, it } from "vitest";
import { sketchOps } from "./Canvas";
import { recognizeSketch, resample } from "./sketch";

/** 手ぶれの代わりの決まった揺れ（乱数を使わず、毎回同じ線にする） */
function wobble(points: Point[], amount: number): Point[] {
  return points.map((p, i) => ({
    x: p.x + Math.sin(i * 1.7) * amount,
    y: p.y + Math.cos(i * 2.3) * amount,
  }));
}

function segment(a: Point, b: Point, n = 20): Point[] {
  return Array.from({ length: n }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / n,
    y: a.y + ((b.y - a.y) * i) / n,
  }));
}

function polyline(corners: Point[], closed = false): Point[] {
  const pts = closed ? [...corners, corners[0] as Point] : corners;
  const out: Point[] = [];
  for (let i = 1; i < pts.length; i++) out.push(...segment(pts[i - 1] as Point, pts[i] as Point));
  out.push(pts[pts.length - 1] as Point);
  return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, turns = 1, start = 0): Point[] {
  const n = 80;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = start + (i / n) * Math.PI * 2 * turns;
    return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  });
}

describe("recognizeSketch（FR-EDIT-13）", () => {
  it("閉じた四角を、外接する四角として読み取る", () => {
    const stroke = wobble(
      polyline(
        [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 200 },
          { x: 100, y: 200 },
        ],
        true,
      ),
      3,
    );
    const shape = recognizeSketch(stroke);
    expect(shape?.type).toBe("rect");
    if (shape?.type !== "rect") return;
    expect(Math.abs(shape.x - 100)).toBeLessThan(8);
    expect(Math.abs(shape.w - 200)).toBeLessThan(10);
    expect(Math.abs(shape.h - 100)).toBeLessThan(10);
  });

  it("少し閉じきらない・はみ出す四角も四角にする", () => {
    const open = polyline([
      { x: 110, y: 100 },
      { x: 300, y: 104 },
      { x: 296, y: 220 },
      { x: 98, y: 214 },
      { x: 102, y: 125 },
    ]);
    expect(recognizeSketch(wobble(open, 2))?.type).toBe("rect");
  });

  it("角の丸い四角は四角、描き始めと重なる円は楕円にする", () => {
    const r = 25;
    const rounded: Point[] = [];
    const corners = [
      { cx: 300 - r, cy: 100 + r, a: -Math.PI / 2 },
      { cx: 300 - r, cy: 260 - r, a: 0 },
      { cx: 60 + r, cy: 260 - r, a: Math.PI / 2 },
      { cx: 60 + r, cy: 100 + r, a: Math.PI },
    ];
    for (const c of corners) {
      for (let i = 0; i <= 8; i++) {
        const t = c.a + (i / 8) * (Math.PI / 2);
        rounded.push({ x: c.cx + r * Math.cos(t), y: c.cy + r * Math.sin(t) });
      }
    }
    rounded.push(rounded[0] as Point);
    expect(recognizeSketch(polyline(rounded))?.type).toBe("rect");
    expect(recognizeSketch(wobble(ellipse(200, 200, 120, 90, 1.12), 2))?.type).toBe("ellipse");
  });

  it("円・横長の楕円を楕円として読み取る", () => {
    expect(recognizeSketch(wobble(ellipse(200, 200, 80, 80), 3))?.type).toBe("ellipse");
    const wide = recognizeSketch(wobble(ellipse(300, 150, 200, 60, 0.95, 1), 3));
    expect(wide?.type).toBe("ellipse");
    if (wide?.type !== "ellipse") return;
    expect(wide.w).toBeGreaterThan(380);
    expect(wide.h).toBeGreaterThan(110);
  });

  it("まっすぐな線を、矢じりのない線にする", () => {
    const shape = recognizeSketch(wobble(segment({ x: 10, y: 10 }, { x: 310, y: 90 }, 40), 2));
    expect(shape).toMatchObject({ type: "arrow", head: "none" });
  });

  it("軸のあとで折り返す線を、先端に向かう矢印にする", () => {
    const stroke = polyline([
      { x: 50, y: 300 },
      { x: 300, y: 100 },
      { x: 255, y: 105 },
      { x: 300, y: 100 },
      { x: 290, y: 145 },
    ]);
    const shape = recognizeSketch(wobble(stroke, 2.5));
    expect(shape).toMatchObject({ type: "arrow", head: "end" });
    if (shape?.type !== "arrow") return;
    expect(shape.from.x).toBeCloseTo(50, -1);
    expect(shape.to.x).toBeCloseTo(300, -1);
    expect(shape.to.y).toBeCloseTo(100, -1);
  });

  it("片側だけの矢じり（レの字）も矢印にする", () => {
    const stroke = polyline([
      { x: 400, y: 100 },
      { x: 100, y: 100 },
      { x: 140, y: 70 },
    ]);
    expect(recognizeSketch(stroke)).toMatchObject({
      type: "arrow",
      from: { x: 400, y: 100 },
      to: { x: 100, y: 100 },
      head: "end",
    });
  });

  it("三角・ひし形・波線・小さすぎる線は読み取らない", () => {
    const triangle = polyline(
      [
        { x: 200, y: 50 },
        { x: 350, y: 300 },
        { x: 50, y: 300 },
      ],
      true,
    );
    const diamond = polyline(
      [
        { x: 200, y: 50 },
        { x: 350, y: 200 },
        { x: 200, y: 350 },
        { x: 50, y: 200 },
      ],
      true,
    );
    const wave = Array.from({ length: 80 }, (_, i) => ({
      x: i * 5,
      y: 100 + Math.sin(i / 4) * 40,
    }));
    expect(recognizeSketch(triangle)).toBeNull();
    expect(recognizeSketch(diamond)).toBeNull();
    expect(recognizeSketch(wave)).toBeNull();
    expect(recognizeSketch(segment({ x: 10, y: 10 }, { x: 13, y: 12 }))).toBeNull();
    expect(recognizeSketch([{ x: 1, y: 1 }])).toBeNull();
  });

  it("等間隔に並べ直す", () => {
    const pts = resample(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      11,
    );
    expect(pts).toHaveLength(11);
    expect(pts[5]?.x).toBeCloseTo(5);
  });
});

describe("sketchOps（FR-EDIT-13）", () => {
  const doc = createDocument({
    width: 800,
    height: 600,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-10-20T00:00:00Z"),
  });

  it("読み取った図形を、ほかと同じ注釈として追加する", () => {
    const r = applyOps(
      doc,
      sketchOps(doc, { type: "ellipse", x: 10, y: 20, w: 100, h: 50 }, { strokeWidth: 6 }),
    );
    expect(r.ok && r.value.annotations).toEqual([
      { id: "ellipse-1", type: "ellipse", x: 10, y: 20, w: 100, h: 50, style: { strokeWidth: 6 } },
    ]);
  });

  it("線は矢じりのない矢印、矢印は矢じりのある矢印にする", () => {
    const line = applyOps(
      doc,
      sketchOps(doc, { type: "arrow", from: { x: 0, y: 0 }, to: { x: 90, y: 0 }, head: "none" }),
    );
    expect(line.ok && line.value.annotations[0]).toEqual({
      id: "arrow-1",
      type: "arrow",
      from: { x: 0, y: 0 },
      to: { x: 90, y: 0 },
      style: { head: "none" },
    });
    const arrow = applyOps(
      doc,
      sketchOps(doc, { type: "arrow", from: { x: 0, y: 0 }, to: { x: 90, y: 0 }, head: "end" }),
    );
    expect(arrow.ok && arrow.value.annotations[0]).not.toHaveProperty("style");
  });
});
