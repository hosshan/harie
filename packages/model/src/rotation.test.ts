import { describe, expect, it } from "vitest";
import { createDocument } from "./document";
import { applyOps } from "./ops";
import { type Annotation, normalizeRotation, rotationOf } from "./schema";

const doc = () =>
  createDocument({
    width: 400,
    height: 300,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-11-12T00:00:00Z"),
  });

describe("FR-EDIT-21: 注釈の回転（ADR-0015）", () => {
  it("角度を -180 より大きく 180 以下にそろえる", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(-0)).toBe(0);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(270)).toBe(-90);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation(540)).toBe(180);
    expect(normalizeRotation(-45.5)).toBe(-45.5);
  });

  it("四角・楕円・テキスト・吹き出しは rotation を持て、ほかの種類では無視する", () => {
    const r = applyOps(doc(), [
      { op: "add", annotation: { id: "r", type: "rect", x: 0, y: 0, w: 10, h: 10, rotation: 30 } },
      {
        op: "add",
        annotation: { id: "c", type: "callout", x: 0, y: 0, w: 99, text: "a", rotation: -90 },
      },
      { op: "add", annotation: { id: "b", type: "badge", x: 0, y: 0, number: 1, rotation: 45 } },
    ]);
    if (!r.ok) throw new Error(r.error.message);
    const [rect, callout, badge] = r.value.annotations as Annotation[];
    expect(rotationOf(rect as Annotation)).toBe(30);
    expect(rotationOf(callout as Annotation)).toBe(-90);
    // 番号は回せない。未知のフィールドとして残すが、描画には使わない
    expect(rotationOf(badge as Annotation)).toBe(0);
  });

  it("数でない角度は受け付けない", () => {
    const r = applyOps(doc(), [
      {
        op: "add",
        annotation: { id: "r", type: "rect", x: 0, y: 0, w: 10, h: 10, rotation: "30" },
      },
    ]);
    expect(r.ok).toBe(false);
  });
});
