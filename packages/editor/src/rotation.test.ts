import { applyOps, createDocument, rotationOf } from "@harie/model";
import { annotationBox, boxCenter, rotatePoint } from "@harie/render";
import { describe, expect, it } from "vitest";
import { hitTest } from "./Canvas";
import { handlePosition, hitsBox, isRotatable, resizePatch, rotatePatch } from "./geometry";

function annotation(a: unknown) {
  const d = createDocument({
    width: 800,
    height: 600,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-11-12T00:00:00Z"),
  });
  const r = applyOps(d, [{ op: "add", annotation: a }]);
  if (!r.ok) throw new Error(r.error.message);
  const out = r.value.annotations[0];
  if (out === undefined) throw new Error();
  return { doc: r.value, a: out };
}

describe("FR-EDIT-21: 回転のつまみ（ADR-0015）", () => {
  const rect = { id: "r", type: "rect", x: 100, y: 100, w: 200, h: 100 };

  it("四角・楕円・テキスト・吹き出しだけを回せる", () => {
    expect(isRotatable(annotation(rect).a)).toBe(true);
    expect(isRotatable(annotation({ id: "b", type: "badge", x: 0, y: 0, number: 1 }).a)).toBe(
      false,
    );
    expect(
      isRotatable(
        annotation({ id: "a", type: "arrow", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }).a,
      ),
    ).toBe(false);
  });

  it("中心から見たつまみの向きを角度にし、真上は 0°（rotation を消す）", () => {
    const { a } = annotation(rect);
    // 中心は (200, 150)
    expect(rotatePatch(a, { x: 200, y: 0 })).toEqual({ rotation: undefined });
    expect(rotatePatch(a, { x: 400, y: 150 })).toEqual({ rotation: 90 });
    expect(rotatePatch(a, { x: 0, y: 150 })).toEqual({ rotation: -90 });
    expect(rotatePatch(a, { x: 200, y: 300 })).toEqual({ rotation: 180 });
    // 90° の倍数の近く（3° 以内）は吸い付く
    const near = rotatePoint({ x: 200, y: 0 }, 2, { x: 200, y: 150 });
    expect(rotatePatch(a, near)).toEqual({ rotation: undefined });
    const off = rotatePoint({ x: 200, y: 0 }, 20, { x: 200, y: 150 });
    expect(rotatePatch(a, off)).toEqual({ rotation: 20 });
  });

  it("Shift（刻みあり）では 15° ずつ", () => {
    const { a } = annotation(rect);
    const p = rotatePoint({ x: 200, y: 0 }, 37, { x: 200, y: 150 });
    expect(rotatePatch(a, p, 15)).toEqual({ rotation: 30 });
  });

  it("回した枠の当たり判定は回した形で行う", () => {
    const { doc, a } = annotation({ ...rect, rotation: 90 });
    // 回す前は範囲内だが、90° 回すと外れる点
    expect(hitsBox(a, { x: 110, y: 140 })).toBe(false);
    // 回す前は範囲外だが、90° 回すと入る点
    expect(hitsBox(a, { x: 200, y: 60 })).toBe(true);
    expect(hitTest(doc, { x: 200, y: 60 }, 0)?.id).toBe("r");
  });

  it("回した枠の大きさを変えても、反対側の角は画面上で動かない", () => {
    const { a } = annotation({ ...rect, rotation: 30 });
    const fixedBefore = rotatePoint(
      handlePosition(a, annotationBox(a), "nw"),
      30,
      boxCenter(annotationBox(a)),
    );
    // se のつまみを画面上で外側へ動かす
    const se = rotatePoint(
      handlePosition(a, annotationBox(a), "se"),
      30,
      boxCenter(annotationBox(a)),
    );
    const patch = resizePatch(a, "se", { x: se.x + 40, y: se.y + 20 });
    const next = { ...a, ...patch } as typeof a;
    expect(rotationOf(next)).toBe(30);
    const box = annotationBox(next);
    const fixedAfter = rotatePoint(handlePosition(next, box, "nw"), 30, boxCenter(box));
    expect(Math.abs(fixedAfter.x - fixedBefore.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(fixedAfter.y - fixedBefore.y)).toBeLessThanOrEqual(1);
    expect(box.w).toBeGreaterThan(200);
  });

  it("回していなければ大きさの変え方は今までどおり", () => {
    const { a } = annotation(rect);
    expect(resizePatch(a, "se", { x: 310, y: 210 })).toEqual({ x: 100, y: 100, w: 210, h: 110 });
  });
});
