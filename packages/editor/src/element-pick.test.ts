import { applyOps, createDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import {
  elementBox,
  elementPadding,
  elementStepOps,
  type PickableElement,
  pickElement,
} from "./element-pick";

const panel: PickableElement = {
  rect: { x: 0, y: 0, w: 800, h: 600 },
  role: "region",
  label: "通知設定",
};
const save: PickableElement = {
  rect: { x: 40, y: 300, w: 160, h: 40 },
  role: "button",
  label: "変更を保存",
};

describe("要素で囲む（FR-EDIT-15）", () => {
  it("FR-EDIT-15: 点を含む要素のうち、いちばん内側（小さい）ものを選び、外れたら選ばない", () => {
    expect(pickElement([panel, save], { x: 100, y: 320 })).toBe(save);
    expect(pickElement([save, panel], { x: 100, y: 320 })).toBe(save);
    expect(pickElement([panel, save], { x: 500, y: 100 })).toBe(panel);
    expect(pickElement([save], { x: 500, y: 100 })).toBeUndefined();
    // 大きさのない要素は選ばない
    expect(
      pickElement([{ ...save, rect: { x: 40, y: 300, w: 0, h: 40 } }], { x: 40, y: 310 }),
    ).toBeUndefined();
  });

  it("FR-EDIT-15: 枠は要素から 8 CSS px（画像の解像度に合わせる）離し、画像の外にははみ出さない", () => {
    const canvas = { width: 800, height: 600 };
    expect(elementBox(save.rect, canvas)).toEqual({ x: 32, y: 292, w: 176, h: 56 });
    // Retina（devicePixelRatio 2）で撮った画像では、画像のピクセルで 16px 離す
    expect(elementPadding(2)).toBe(16);
    expect(elementPadding(1.5)).toBe(12);
    expect(elementPadding(Number.NaN)).toBe(8);
    expect(elementBox(save.rect, canvas, elementPadding(2))).toEqual({
      x: 24,
      y: 284,
      w: 192,
      h: 72,
    });
    expect(elementBox({ x: 1.6, y: 0, w: 799, h: 20.2 }, canvas)).toEqual({
      x: 0,
      y: 0,
      w: 800,
      h: 28,
    });
  });

  it("FR-EDIT-15: 枠と、その枠に紐付けた番号・吹き出しを 1 回の操作で足す", () => {
    const doc = createDocument({
      width: 800,
      height: 600,
      docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
      now: new Date("2026-10-23T00:00:00Z"),
    });
    const { ops, rectId } = elementStepOps(doc, save, { calloutText: "「変更を保存」を押します" });
    expect(ops.map((o) => o.annotation)).toEqual([
      expect.objectContaining({ id: rectId, type: "rect", x: 32, y: 292, w: 176, h: 56 }),
      expect.objectContaining({ type: "badge", number: 1, anchor: { annotationId: rectId } }),
      expect.objectContaining({
        type: "callout",
        text: "「変更を保存」を押します",
        anchor: expect.objectContaining({ annotationId: rectId }),
      }),
    ]);
    const applied = applyOps(doc, ops);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    // 続けて選ぶと、番号は次から振る
    const next = elementStepOps(applied.value, panel, { calloutText: "説明文を入力" });
    expect(next.ops[1]?.annotation).toMatchObject({ type: "badge", number: 2 });
    expect(applyOps(applied.value, next.ops).ok).toBe(true);
  });
});
