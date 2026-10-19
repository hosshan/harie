import { createDocument, type HarieDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { editorReducer, initialState } from "./history";
import {
  annotationsInRect,
  mergeSelection,
  moveOps,
  removeOps,
  toggleSelection,
} from "./selection";

const doc = (): HarieDocument => ({
  ...createDocument({
    width: 800,
    height: 600,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-10-07T00:00:00Z"),
  }),
  annotations: [
    { id: "rect-1", type: "rect", x: 10, y: 10, w: 100, h: 50 },
    { id: "badge-1", type: "badge", x: 0, y: 0, number: 1, anchor: { annotationId: "rect-1" } },
    { id: "arrow-1", type: "arrow", from: { x: 300, y: 300 }, to: { x: 400, y: 300 } },
    { id: "text-1", type: "text", x: 600, y: 500, text: "保存" },
  ],
});

describe("複数の注釈の選択（FR-EDIT-11）", () => {
  it("Shift + クリックで選択に足し、もう一度で外す", () => {
    expect(toggleSelection(["rect-1"], "arrow-1")).toEqual(["rect-1", "arrow-1"]);
    expect(toggleSelection(["rect-1", "arrow-1"], "rect-1")).toEqual(["arrow-1"]);
  });

  it("範囲に少しでも重なる注釈を選び、元の選択に足す", () => {
    expect(annotationsInRect(doc(), { x: 90, y: 40, w: 250, h: 270 })).toEqual([
      "rect-1",
      "arrow-1",
    ]);
    expect(annotationsInRect(doc(), { x: 700, y: 10, w: 50, h: 50 })).toEqual([]);
    expect(mergeSelection(["text-1"], ["rect-1", "text-1"])).toEqual(["text-1", "rect-1"]);
  });

  it("まとめて動かし、枠に紐付けた番号は枠と一緒なら紐付けたまま付いていく", () => {
    let s = initialState(doc());
    s = editorReducer(s, {
      type: "apply",
      ops: moveOps(s.doc, ["rect-1", "badge-1", "arrow-1"], 20, 10),
    });
    const [rect, badge, arrow] = s.doc.annotations;
    expect(rect).toMatchObject({ x: 30, y: 20 });
    expect(badge).toMatchObject({ anchor: { annotationId: "rect-1" } });
    expect(arrow).toMatchObject({ from: { x: 320, y: 310 }, to: { x: 420, y: 310 } });
    // 1 回の操作として元に戻せる
    s = editorReducer(s, { type: "undo" });
    expect(s.doc.annotations[0]).toMatchObject({ x: 10, y: 10 });
  });

  it("番号だけを動かしたときは紐付けを外す（ADR-0011）", () => {
    const [op] = moveOps(doc(), ["badge-1"], 5, 5) as { patch: Record<string, unknown> }[];
    expect(op?.patch).toHaveProperty("anchor", undefined);
  });

  it("まとめて消し、選択も外れる。元に戻すと選択も戻る", () => {
    let s = editorReducer(initialState(doc()), { type: "select", ids: ["rect-1", "text-1"] });
    expect(s.selectedIds).toEqual(["rect-1", "text-1"]);
    s = editorReducer(s, { type: "apply", ops: removeOps(s.selectedIds) });
    expect(s.doc.annotations.map((a) => a.id)).toEqual(["badge-1", "arrow-1"]);
    expect(s.selectedIds).toEqual([]);
    s = editorReducer(s, { type: "undo" });
    expect(s.doc.annotations).toHaveLength(4);
  });

  it("ないものは選ばない・同じものを重ねて選ばない", () => {
    const s = editorReducer(initialState(doc()), {
      type: "select",
      ids: ["rect-1", "missing", "rect-1"],
    });
    expect(s.selectedIds).toEqual(["rect-1"]);
  });
});
