import { applyOps, createDocument, recordPiiApplied } from "@harie/model";
import { describe, expect, it } from "vitest";
import { rebaseDocument } from "./rebase";

function doc(annotations: unknown[]) {
  const d = createDocument({
    width: 800,
    height: 600,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-10-07T00:00:00Z"),
  });
  const r = applyOps(
    d,
    annotations.map((annotation) => ({ op: "add", annotation })),
  );
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const annotations = [
  { id: "r", type: "rect", x: 100, y: 60, w: 200, h: 80, style: { radius: 8 } },
  { id: "a", type: "arrow", from: { x: 10, y: 20 }, to: { x: 30, y: 40 } },
  { id: "c", type: "callout", x: 400, y: 100, w: 240, text: "説明" },
  { id: "b", type: "badge", x: 0, y: 0, number: 1, anchor: { annotationId: "r" } },
];

describe("rebaseDocument", () => {
  it("FR-EDIT-10: 同じ大きさなら注釈はそのまま引き継ぐ", () => {
    const before = doc(annotations);
    const { doc: after } = rebaseDocument(before, { width: 800, height: 600 });
    expect(after.annotations).toBe(before.annotations);
    expect(after.canvas).toEqual(before.canvas);
  });

  it("FR-EDIT-10: 大きさが違えば位置・大きさ・線の太さ・文字の大きさを比率で合わせる", () => {
    const { doc: after } = rebaseDocument(doc(annotations), { width: 1600, height: 1200 });
    expect(after.canvas).toMatchObject({ width: 1600, height: 1200 });
    const [r, a, c, b] = after.annotations;
    // 省略していた線の太さ（既定 4）・文字の大きさ（既定 24）も 2 倍にして書き込む
    expect(r).toMatchObject({
      x: 200,
      y: 120,
      w: 400,
      h: 160,
      style: { radius: 16, strokeWidth: 8, fontSize: 48 },
    });
    expect(a).toMatchObject({ from: { x: 20, y: 40 }, to: { x: 60, y: 80 } });
    expect(c).toMatchObject({ x: 800, y: 200, w: 480, style: { fontSize: 48 } });
    // 紐付けた番号は、拡大した枠の左上の外側に置き直す（ADR-0011）
    expect(b).toMatchObject({
      x: Math.round(200 - 48 * 1.6 - 4),
      y: Math.round(120 - 48 * 1.6 - 4),
    });
  });

  it("FR-EDIT-10: 縦横比が違うときは軸ごとに位置を合わせ、線と文字は小さい方の比率にする", () => {
    const { doc: after } = rebaseDocument(doc(annotations.slice(0, 1)), {
      width: 1600,
      height: 900,
    });
    expect(after.annotations[0]).toMatchObject({
      x: 200,
      y: 90,
      w: 400,
      h: 120,
      style: { strokeWidth: 6, fontSize: 36 },
    });
  });

  it("ADR-0007: 元の画像の PII 加工の記録は外し、新しい座標で候補として返す", () => {
    const masked = recordPiiApplied(doc([]), [
      { kind: "email", method: "fill", rect: { x: 10, y: 10, w: 100, h: 20 } },
    ]);
    const { doc: after, previousPii } = rebaseDocument(masked, { width: 400, height: 300 });
    expect(after.pii.applied).toEqual([]);
    expect(previousPii).toEqual([
      { kind: "email", method: "fill", rect: { x: 5, y: 5, w: 50, h: 10 } },
    ]);
  });
});
