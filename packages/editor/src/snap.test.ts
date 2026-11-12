import { createDocument, type HarieDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import {
  connectionPoints,
  snapArrowEnd,
  snapDisabled,
  snapExclusions,
  snapLines,
  snapMove,
  snapPoint,
} from "./snap";

const doc = (): HarieDocument => ({
  ...createDocument({
    width: 800,
    height: 600,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-11-12T00:00:00Z"),
  }),
  annotations: [
    { id: "rect-1", type: "rect", x: 100, y: 100, w: 200, h: 100 },
    { id: "badge-1", type: "badge", x: 0, y: 0, number: 1, anchor: { annotationId: "rect-1" } },
    { id: "rect-2", type: "rect", x: 500, y: 400, w: 100, h: 60 },
    { id: "arrow-1", type: "arrow", from: { x: 50, y: 550 }, to: { x: 150, y: 550 } },
  ],
});

describe("吸着とガイド線（FR-EDIT-23）", () => {
  it("画像の端・中央と、注釈の左右の端・中央、上下の端・中央を線にする", () => {
    const lines = snapLines(doc(), new Set(["rect-2", "arrow-1", "badge-1"]));
    expect(lines.x).toEqual([0, 400, 800, 100, 200, 300]);
    expect(lines.y).toEqual([0, 300, 600, 100, 150, 200]);
  });

  it("近い線にだけそろえ、左右と上下は別々に判定する", () => {
    const lines = { x: [100], y: [300] };
    const r = snapPoint({ x: 104, y: 320 }, lines, 6);
    expect(r.point).toEqual({ x: 100, y: 320 });
    expect(r.guides).toEqual([{ axis: "x", at: 100 }]);
  });

  it("動かす注釈の中央を、画像の中央にそろえる", () => {
    // rect-2（中央 x=550）を左へ 147 動かすと中央が 403。画像の中央 400 にそろう
    const r = snapMove(doc(), ["rect-2"], { x: 550, y: 430 }, { x: 403, y: 430 }, 6);
    expect(r.point.x).toBe(400);
    expect(r.guides).toContainEqual({ axis: "x", at: 400 });
  });

  it("動かす注釈の端を、ほかの注釈の端にそろえる", () => {
    // rect-2 の左端（500）を 298 へ。rect-1 の右端 300 にそろう
    const r = snapMove(doc(), ["rect-2"], { x: 0, y: 0 }, { x: -202, y: 7 }, 6);
    expect(r.point.x).toBe(-200);
    expect(r.guides).toContainEqual({ axis: "x", at: 300 });
  });

  it("動かしている注釈と、それに付いていく番号にはそろえない", () => {
    const ex = snapExclusions(doc(), ["rect-1"]);
    expect([...ex].sort()).toEqual(["badge-1", "rect-1"]);
    // rect-1 を少しだけ動かしても、元の自分の位置へ戻されない
    const d = doc();
    const alone = { ...d, annotations: d.annotations.filter((a) => a.id !== "arrow-1") };
    const r = snapMove(alone, ["rect-1"], { x: 0, y: 0 }, { x: 5, y: 0 }, 6);
    expect(r.point.x).toBe(5);
  });

  it("矢印の端は、図形の中央と各辺の中点に吸い付く（矢印には吸い付かない）", () => {
    const points = connectionPoints(doc(), new Set(["badge-1"]));
    expect(points).toContainEqual({ x: 200, y: 150 });
    expect(points).toContainEqual({ x: 300, y: 150 });
    expect(points).toContainEqual({ x: 550, y: 400 });
    expect(points).not.toContainEqual({ x: 100, y: 550 });
    const r = snapArrowEnd({ x: 296, y: 156 }, points, snapLines(doc()), 6);
    expect(r.point).toEqual({ x: 300, y: 150 });
    expect(r.anchor).toEqual({ x: 300, y: 150 });
  });

  it("図形の点が遠ければ、矢印の端も線にそろえる", () => {
    const d = doc();
    const r = snapArrowEnd({ x: 397, y: 50 }, connectionPoints(d), snapLines(d), 6);
    expect(r.anchor).toBeUndefined();
    expect(r.point).toEqual({ x: 400, y: 50 });
  });

  it("⌘（Mac）/ Ctrl を押している間は吸着しない", () => {
    expect(snapDisabled({ metaKey: true, ctrlKey: false }, true)).toBe(true);
    expect(snapDisabled({ metaKey: false, ctrlKey: true }, true)).toBe(false);
    expect(snapDisabled({ metaKey: false, ctrlKey: true }, false)).toBe(true);
  });
});
