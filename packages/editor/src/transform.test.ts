import { applyOps, createDocument, type HarieDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { flipOps, turnOps } from "./transform";

function doc(annotations: unknown[]): HarieDocument {
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

function run(d: HarieDocument, ops: unknown[]) {
  const r = applyOps(d, ops);
  if (!r.ok) throw new Error(r.error.message);
  return Object.fromEntries(r.value.annotations.map((a) => [a.id, a]));
}

const rect = { id: "r", type: "rect", x: 100, y: 100, w: 200, h: 100 };

describe("FR-EDIT-22: 90° 回転", () => {
  it("四角 1 つは中心を保って幅と高さを入れ替え、rotation は付けない", () => {
    const d = doc([rect]);
    const out = run(d, turnOps(d, ["r"], "cw"));
    expect(out.r).toMatchObject({ x: 150, y: 50, w: 100, h: 200 });
    expect(out.r).not.toHaveProperty("rotation");
  });

  it("テキスト・吹き出しは rotation を 90° ずつ足し、一周したら外す", () => {
    let d = doc([{ id: "t", type: "text", x: 10, y: 10, text: "a", rotation: 180 }]);
    let out = run(d, turnOps(d, ["t"], "cw"));
    expect(out.t).toMatchObject({ rotation: -90, x: 10, y: 10 });
    d = doc([{ id: "t", type: "text", x: 10, y: 10, text: "a", rotation: 90 }]);
    out = run(d, turnOps(d, ["t"], "ccw"));
    expect(out.t?.rotation).toBeUndefined();
  });

  it("矢印は端点を中心の周りで回す", () => {
    const d = doc([{ id: "a", type: "arrow", from: { x: 0, y: 100 }, to: { x: 200, y: 100 } }]);
    const out = run(d, turnOps(d, ["a"], "cw"));
    expect(out.a).toMatchObject({ from: { x: 100, y: 0 }, to: { x: 100, y: 200 } });
  });

  it("2 つ以上なら全体の中心を軸に位置も回す。番号 1 つだけでは変わらない", () => {
    const d = doc([
      { id: "a", type: "rect", x: 0, y: 0, w: 100, h: 100 },
      { id: "b", type: "rect", x: 200, y: 0, w: 100, h: 100 },
      { id: "n", type: "badge", x: 0, y: 0, number: 1 },
    ]);
    const out = run(d, turnOps(d, ["a", "b"], "cw"));
    // 全体の中心 (150, 50)。a の中心 (50, 50) → (150, -50)、b の中心 (250, 50) → (150, 150)
    expect(out.a).toMatchObject({ x: 100, y: -100 });
    expect(out.b).toMatchObject({ x: 100, y: 100 });
    expect(turnOps(d, ["n"], "cw")).toEqual([]);
  });
});

describe("FR-EDIT-22: 反転", () => {
  it("回していない四角 1 つは変わらない。回していれば角度の向きを逆にする", () => {
    let d = doc([rect]);
    expect(flipOps(d, ["r"], "horizontal")).toEqual([]);
    d = doc([{ ...rect, rotation: 30 }]);
    expect(run(d, flipOps(d, ["r"], "vertical")).r).toMatchObject({ rotation: -30, x: 100 });
  });

  it("矢印は向きが反転する", () => {
    const d = doc([{ id: "a", type: "arrow", from: { x: 0, y: 0 }, to: { x: 200, y: 100 } }]);
    const out = run(d, flipOps(d, ["a"], "horizontal"));
    expect(out.a).toMatchObject({ from: { x: 200, y: 0 }, to: { x: 0, y: 100 } });
  });

  it("2 つ以上なら全体の中心で位置を入れ替え、枠に紐付けた番号は枠に付いていく", () => {
    const d = doc([
      { id: "a", type: "rect", x: 0, y: 0, w: 100, h: 50 },
      { id: "c", type: "callout", x: 300, y: 0, w: 100, text: "x" },
      { id: "n", type: "badge", x: 0, y: 0, number: 1, anchor: { annotationId: "a" } },
    ]);
    const ops = flipOps(d, ["a", "c", "n"], "horizontal");
    expect(ops.map((o) => (o as { id: string }).id)).toEqual(["a", "c"]);
    const out = run(d, ops);
    expect(out.a).toMatchObject({ x: 300 });
    expect(out.c).toMatchObject({ x: 0 });
  });
});
