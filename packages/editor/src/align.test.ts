import { applyOps, createDocument, type HarieDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { alignOps, canDistribute, distributeOps } from "./align";

const doc = (): HarieDocument => ({
  ...createDocument({
    width: 800,
    height: 600,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-10-07T00:00:00Z"),
  }),
  annotations: [
    { id: "rect-1", type: "rect", x: 10, y: 20, w: 100, h: 50 },
    { id: "badge-1", type: "badge", x: 0, y: 0, number: 1, anchor: { annotationId: "rect-1" } },
    { id: "rect-2", type: "rect", x: 200, y: 100, w: 40, h: 40 },
    { id: "arrow-1", type: "arrow", from: { x: 400, y: 300 }, to: { x: 500, y: 340 } },
  ],
});

const apply = (d: HarieDocument, ops: unknown[]): HarieDocument => {
  const r = applyOps(d, ops);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const find = (d: HarieDocument, id: string) => d.annotations.find((a) => a.id === id);

describe("整列（FR-EDIT-20）", () => {
  it("左揃え: 選んだ範囲の左端に揃える。矢印は両端を動かす", () => {
    const next = apply(doc(), alignOps(doc(), ["rect-1", "rect-2", "arrow-1"], "left"));
    expect(find(next, "rect-2")).toMatchObject({ x: 10, y: 100 });
    expect(find(next, "arrow-1")).toMatchObject({ from: { x: 10, y: 300 }, to: { x: 110 } });
  });

  it("右揃え・下揃え: 右端・下端に揃える", () => {
    const right = apply(doc(), alignOps(doc(), ["rect-1", "rect-2"], "right"));
    expect(find(right, "rect-1")).toMatchObject({ x: 140 });
    expect(find(right, "rect-2")).toMatchObject({ x: 200 });
    const bottom = apply(doc(), alignOps(doc(), ["rect-1", "rect-2"], "bottom"));
    expect(find(bottom, "rect-1")).toMatchObject({ y: 90 });
  });

  it("中央揃え: 選んだ範囲の中心に中心を揃える", () => {
    const next = apply(doc(), alignOps(doc(), ["rect-1", "rect-2"], "hcenter"));
    // 範囲は x 10〜240、中心 125
    expect(find(next, "rect-1")).toMatchObject({ x: 75 });
    expect(find(next, "rect-2")).toMatchObject({ x: 105 });
    const v = apply(doc(), alignOps(doc(), ["rect-1", "rect-2"], "vcenter"));
    // 範囲は y 20〜140、中心 80
    expect(find(v, "rect-1")).toMatchObject({ y: 55 });
    expect(find(v, "rect-2")).toMatchObject({ y: 60 });
  });

  it("1 つだけ選んでいるときは画像に揃える", () => {
    const next = apply(doc(), alignOps(doc(), ["rect-2"], "hcenter"));
    expect(find(next, "rect-2")).toMatchObject({ x: 380 });
    const bottom = apply(doc(), alignOps(doc(), ["rect-2"], "bottom"));
    expect(find(bottom, "rect-2")).toMatchObject({ y: 560 });
  });

  it("枠と一緒に選んだ紐付けた番号は動かさず、枠に付いていく（ADR-0011）", () => {
    const ops = alignOps(doc(), ["rect-1", "badge-1", "rect-2"], "top");
    expect(ops).toEqual([{ op: "update", id: "rect-2", patch: { x: 200, y: 20 } }]);
    // 枠と番号だけなら 1 つ扱い（画像に揃える）
    const next = apply(doc(), alignOps(doc(), ["rect-1", "badge-1"], "left"));
    expect(find(next, "rect-1")).toMatchObject({ x: 0 });
    expect(find(next, "badge-1")).toMatchObject({ anchor: { annotationId: "rect-1" } });
  });

  it("位置が変わらなければ空", () => {
    expect(alignOps(doc(), ["rect-1"], "top").length).toBe(1);
    const once = apply(doc(), alignOps(doc(), ["rect-1", "rect-2"], "top"));
    expect(alignOps(once, ["rect-1", "rect-2"], "top")).toEqual([]);
    expect(alignOps(doc(), [], "left")).toEqual([]);
  });
});

describe("等間隔に並べる（FR-EDIT-20）", () => {
  it("両端を動かさず、間のすき間を等しくする", () => {
    // 横: rect-1 10〜110、rect-2 200〜240、arrow-1 400〜500。すき間 (490-240)/2 = 125
    const next = apply(doc(), distributeOps(doc(), ["rect-1", "rect-2", "arrow-1"], "horizontal"));
    expect(find(next, "rect-1")).toMatchObject({ x: 10 });
    expect(find(next, "rect-2")).toMatchObject({ x: 235 });
    expect(find(next, "arrow-1")).toMatchObject({ from: { x: 400 } });
  });

  it("縦にも並べられる", () => {
    // 縦: rect-1 20〜70、rect-2 100〜140、arrow-1 300〜340。すき間 (320-130)/2 = 95
    const next = apply(doc(), distributeOps(doc(), ["rect-1", "rect-2", "arrow-1"], "vertical"));
    expect(find(next, "rect-2")).toMatchObject({ y: 165 });
  });

  it("3 つ未満なら使えない（枠に付いていく番号は数えない）", () => {
    expect(canDistribute(doc(), ["rect-1", "badge-1", "rect-2"])).toBe(false);
    expect(distributeOps(doc(), ["rect-1", "rect-2"], "horizontal")).toEqual([]);
    expect(canDistribute(doc(), ["rect-1", "rect-2", "arrow-1"])).toBe(true);
  });
});
