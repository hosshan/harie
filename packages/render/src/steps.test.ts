import { type Annotation, applyOps, createDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { completeSteps, placeCallout } from "./steps";

function doc(annotations: unknown[], size = { width: 1200, height: 800 }) {
  const d = createDocument({
    ...size,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-10-20T00:00:00Z"),
  });
  const r = applyOps(
    d,
    annotations.map((annotation) => ({ op: "add", annotation })),
  );
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const added = (result: ReturnType<typeof completeSteps>): Annotation[] =>
  result.ops.map((o) => o.annotation);

describe("completeSteps", () => {
  it("FR-EDIT-14: 番号も吹き出しもない枠に、描いた順で番号を振り、吹き出しを紐付ける", () => {
    // 2 つ目の枠のほうが上にあっても、描いた順（配列の順）で番号を振る
    const d = doc([
      { id: "r1", type: "rect", x: 100, y: 400, w: 200, h: 60 },
      { id: "r2", type: "ellipse", x: 100, y: 100, w: 200, h: 60 },
    ]);
    const result = completeSteps(d, { calloutText: "説明文を入力" });
    expect(result.boxes).toBe(2);
    expect(added(result)).toEqual([
      // 番号は枠の左上の角の外側（ADR-0011。既定の大きさなら 40 ずらす）
      expect.objectContaining({
        type: "badge",
        number: 1,
        x: 60,
        y: 360,
        anchor: { annotationId: "r1" },
      }),
      expect.objectContaining({
        type: "callout",
        text: "説明文を入力",
        x: 316,
        y: 400,
        w: 240,
        anchor: { annotationId: "r1", side: "right" },
      }),
      expect.objectContaining({ type: "badge", number: 2, anchor: { annotationId: "r2" } }),
      expect.objectContaining({ type: "callout", anchor: { annotationId: "r2", side: "right" } }),
    ]);
    const applied = applyOps(d, result.ops);
    expect(applied.ok).toBe(true);
    expect(new Set(result.ids).size).toBe(4);
  });

  it("FR-EDIT-14: 付いている方は足さず、番号は今ある番号の続きから振る", () => {
    const d = doc([
      { id: "r1", type: "rect", x: 100, y: 100, w: 200, h: 60 },
      { id: "b1", type: "badge", x: 0, y: 0, number: 3, anchor: { annotationId: "r1" } },
      { id: "r2", type: "rect", x: 100, y: 300, w: 200, h: 60 },
      // 紐付けていなくても、枠のすぐ近くの吹き出しは付いているとみなす
      { id: "c2", type: "callout", x: 320, y: 300, w: 200, text: "既存" },
      { id: "r3", type: "rect", x: 100, y: 500, w: 200, h: 60 },
    ]);
    const result = completeSteps(d, { calloutText: "説明" });
    expect(result.boxes).toBe(3);
    expect(added(result).map((a) => [a.type, a.anchor])).toEqual([
      ["callout", { annotationId: "r1", side: "right" }],
      ["badge", { annotationId: "r2" }],
      ["badge", { annotationId: "r3" }],
      ["callout", { annotationId: "r3", side: "right" }],
    ]);
    expect(added(result).flatMap((a) => (a.type === "badge" ? [a.number] : []))).toEqual([4, 5]);
  });

  it("FR-EDIT-14: 番号・吹き出しがそろった枠、提案中の枠、枠でない注釈には何もしない", () => {
    const d = doc([
      { id: "r1", type: "rect", x: 100, y: 100, w: 200, h: 60 },
      { id: "b1", type: "badge", x: 60, y: 60, number: 1 },
      {
        id: "c1",
        type: "callout",
        x: 600,
        y: 100,
        w: 200,
        text: "a",
        anchor: { annotationId: "r1", side: "right" },
      },
      { id: "s", type: "rect", x: 100, y: 400, w: 200, h: 60, status: "suggested" },
      { id: "a", type: "arrow", from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
      { id: "t", type: "text", x: 500, y: 500, text: "t" },
    ]);
    expect(completeSteps(d, { calloutText: "説明" })).toEqual({ ops: [], ids: [], boxes: 0 });
  });

  it("FR-EDIT-14: ids を渡すと、その枠だけを対象にする", () => {
    const d = doc([
      { id: "r1", type: "rect", x: 100, y: 100, w: 200, h: 60 },
      { id: "r2", type: "rect", x: 100, y: 300, w: 200, h: 60 },
    ]);
    const result = completeSteps(d, { ids: ["r2", "missing"], calloutText: "説明" });
    expect(result.boxes).toBe(1);
    expect(added(result)).toEqual([
      expect.objectContaining({ type: "badge", number: 1, anchor: { annotationId: "r2" } }),
      expect.objectContaining({ type: "callout", anchor: { annotationId: "r2", side: "right" } }),
    ]);
  });

  it("FR-EDIT-14: 吹き出しはほかの注釈・先に置いた吹き出しに重ならない側へ置く", () => {
    // 2 つの枠が縦に近く並ぶと、2 つ目の吹き出しは右だと 1 つ目の吹き出しに重なるので左に回す
    const d = doc([
      { id: "r1", type: "rect", x: 400, y: 100, w: 200, h: 40 },
      { id: "r2", type: "rect", x: 400, y: 150, w: 200, h: 40 },
    ]);
    const callouts = added(completeSteps(d, { calloutText: "説明" })).filter(
      (a) => a.type === "callout",
    );
    expect(callouts.map((a) => a.anchor)).toEqual([
      { annotationId: "r1", side: "right" },
      { annotationId: "r2", side: "left" },
    ]);
  });

  it("FR-EDIT-14: 指定したスタイルを番号・吹き出しに付ける", () => {
    const d = doc([{ id: "r1", type: "rect", x: 100, y: 100, w: 200, h: 60 }]);
    const result = completeSteps(d, {
      calloutText: "説明",
      calloutStyle: { fontSize: 16 },
      badgeStyle: { fontSize: 20 },
    });
    expect(added(result)).toEqual([
      expect.objectContaining({ type: "badge", style: { fontSize: 20 }, x: 66, y: 66 }),
      expect.objectContaining({ type: "callout", style: { fontSize: 16 } }),
    ]);
  });
});

describe("placeCallout", () => {
  const canvas = { width: 1000, height: 600 };
  const size = { w: 200, h: 60 };

  it("右 → 左 → 下 → 上の順で、画像に収まる側に置く", () => {
    expect(placeCallout({ x: 100, y: 100, w: 100, h: 40 }, size, canvas).side).toBe("right");
    expect(placeCallout({ x: 700, y: 100, w: 200, h: 40 }, size, canvas).side).toBe("left");
    expect(placeCallout({ x: 100, y: 100, w: 800, h: 40 }, size, canvas)).toEqual({
      x: 100,
      y: 156,
      side: "bottom",
    });
    expect(placeCallout({ x: 100, y: 400, w: 800, h: 180 }, size, canvas).side).toBe("top");
  });

  it("どの側もほかの注釈に重なるときは、画像に収まる最初の側に置く", () => {
    const everywhere = [{ x: 0, y: 0, w: 1000, h: 600 }];
    expect(placeCallout({ x: 300, y: 300, w: 100, h: 40 }, size, canvas, everywhere).side).toBe(
      "right",
    );
  });
});
