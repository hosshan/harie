import { applyOps, createDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { annotationBounds, annotationBox, badgeAnchorPosition, buildSvg, rotatePoint } from "./svg";

function doc(annotations: unknown[]) {
  const d = createDocument({
    width: 800,
    height: 600,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-11-12T00:00:00Z"),
  });
  const r = applyOps(
    d,
    annotations.map((annotation) => ({ op: "add", annotation })),
  );
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe("FR-EDIT-21: 回転した注釈の描画（ADR-0015）", () => {
  it("範囲の中心を軸に回すグループで包む。0° なら包まない", () => {
    const svg = buildSvg(
      doc([
        { id: "r", type: "rect", x: 100, y: 100, w: 200, h: 100, rotation: 30 },
        { id: "e", type: "ellipse", x: 400, y: 100, w: 80, h: 40, rotation: -45 },
        { id: "t", type: "text", x: 10, y: 400, text: "回転", rotation: 90 },
        { id: "z", type: "rect", x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      ]),
    );
    expect(svg).toContain('<g transform="rotate(30 200 150)"><rect');
    expect(svg).toContain('<g transform="rotate(-45 440 120)"><ellipse');
    expect(svg).toContain('transform="rotate(90 ');
    expect(svg.match(/rotate\(/g)).toHaveLength(3);
    expect(svg).toMatchSnapshot();
  });

  it("annotationBounds は回した形を囲む四角、annotationBox は回す前の範囲", () => {
    const a = doc([{ id: "r", type: "rect", x: 100, y: 100, w: 200, h: 100, rotation: 90 }])
      .annotations[0];
    if (a === undefined) throw new Error();
    expect(annotationBox(a)).toEqual({ x: 100, y: 100, w: 200, h: 100 });
    const b = annotationBounds(a);
    expect(b.x).toBeCloseTo(150);
    expect(b.y).toBeCloseTo(50);
    expect(b.w).toBeCloseTo(100);
    expect(b.h).toBeCloseTo(200);
  });

  it("番号は回した枠を囲む四角の左上の外側に置く", () => {
    const d = doc([
      { id: "r", type: "rect", x: 100, y: 100, w: 200, h: 100, rotation: 90 },
      { id: "b", type: "badge", x: 0, y: 0, number: 1, anchor: { annotationId: "r" } },
    ]);
    const [box, badge] = d.annotations;
    if (box === undefined || badge?.type !== "badge") throw new Error();
    const p = badgeAnchorPosition(badge, box);
    // 既定の大きさで（直径 38.4 + 線の太さの半分 2）ずらす
    expect(p.x).toBeCloseTo(150 - 38.4 - 2);
    expect(p.y).toBeCloseTo(50 - 38.4 - 2);
  });

  it("回した吹き出しの線は、吹き出しの縁から出す", () => {
    const svg = buildSvg(
      doc([
        { id: "r", type: "rect", x: 500, y: 100, w: 100, h: 100 },
        {
          id: "c",
          type: "callout",
          x: 100,
          y: 100,
          w: 200,
          text: "説明",
          rotation: 90,
          anchor: { annotationId: "r", side: "right" },
        },
      ]),
    );
    // 吹き出しの中心から右へ向かう線は、90° 回した吹き出しの縁（中心から高さの半分）から出る
    const line = /<line x1="([\d.]+)" y1="([\d.]+)"/.exec(svg);
    expect(line).not.toBeNull();
    const callout = doc([{ id: "c", type: "callout", x: 100, y: 100, w: 200, text: "説明" }])
      .annotations[0];
    if (callout === undefined) throw new Error();
    const box = annotationBox(callout);
    expect(Number(line?.[1])).toBeCloseTo(200 + box.h / 2, 0);
    expect(svg).toContain(`rotate(90 200 ${Math.round((100 + box.h / 2) * 100) / 100})`);
  });

  it("rotatePoint は時計回りに回す", () => {
    close(rotatePoint({ x: 10, y: 0 }, 90, { x: 0, y: 0 }), { x: 0, y: 10 });
    close(rotatePoint({ x: 10, y: 0 }, 0, { x: 0, y: 0 }), { x: 10, y: 0 });
  });
});
