import { describe, expect, it } from "vitest";
import { createDocument, keepAspect, outputSize, viewSize } from "./document";
import { migrateDocument } from "./migrate";
import { applyOps } from "./ops";

const DOC_ID = "c8be77cd-bc6d-4747-bf15-12e345a4b522";
const NOW = new Date("2026-10-07T08:00:00Z");
const doc = () => createDocument({ width: 1280, height: 800, docId: DOC_ID, now: NOW });

describe("書き出しの大きさ（FR-EDIT-24）", () => {
  it("FR-EDIT-24: 決めていなければ画像と同じ大きさ", () => {
    expect(outputSize(doc())).toEqual({ width: 1280, height: 800 });
    expect(doc().canvas).not.toHaveProperty("output");
  });

  it("FR-EDIT-24: setOutputSize で決め、null で元に戻す。注釈・画像の大きさは変えない", () => {
    const set = applyOps(doc(), [{ op: "setOutputSize", size: { width: 640, height: 400 } }]);
    if (!set.ok) throw new Error(set.error.message);
    expect(set.value.canvas).toMatchObject({
      width: 1280,
      height: 800,
      output: { width: 640, height: 400 },
    });
    expect(outputSize(set.value)).toEqual({ width: 640, height: 400 });
    const reset = applyOps(set.value, [{ op: "setOutputSize", size: null }]);
    if (!reset.ok) throw new Error(reset.error.message);
    expect(reset.value.canvas).not.toHaveProperty("output");
  });

  it("FR-EDIT-24: 0 以下・小数・上限超えの大きさは受け付けない", () => {
    for (const size of [
      { width: 0, height: 10 },
      { width: 10.5, height: 10 },
      { width: 9000, height: 10 },
    ]) {
      expect(applyOps(doc(), [{ op: "setOutputSize", size }]).ok).toBe(false);
    }
  });

  it("FR-EDIT-24: トリミングしていれば表示範囲の大きさが基準になる", () => {
    const d = { ...doc(), canvas: { ...doc().canvas, crop: { x: 0, y: 0, w: 400, h: 300 } } };
    expect(viewSize(d)).toEqual({ width: 400, height: 300 });
    expect(outputSize(d)).toEqual({ width: 400, height: 300 });
    expect(keepAspect(d, { width: 200 })).toEqual({ width: 200, height: 150 });
  });

  it("FR-EDIT-24: 縦横比を保ってもう一方を求める", () => {
    expect(keepAspect(doc(), { width: 1000 })).toEqual({ width: 1000, height: 625 });
    expect(keepAspect(doc(), { height: 400 })).toEqual({ width: 640, height: 400 });
  });

  it("FR-EDIT-24: canvas の知らない項目は読み込み後も残す", () => {
    const raw = JSON.parse(JSON.stringify(doc()));
    raw.canvas.future = 1;
    raw.canvas.output = { width: 100, height: 50 };
    const r = migrateDocument(raw);
    if (!r.ok) throw new Error(String(r.error));
    expect(r.value.canvas).toMatchObject({ future: 1, output: { width: 100, height: 50 } });
  });
});
