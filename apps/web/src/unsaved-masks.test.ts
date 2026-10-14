import type { HarieDocument, PiiMask } from "@harie/model";
import { describe, expect, it } from "vitest";
import { addUnsaved, masksInImage, removeUnsaved } from "./unsaved-masks";

const before = { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/png" as const };
const saved: HarieDocument["pii"] = {
  ...({} as HarieDocument["pii"]),
  applied: [{ kind: "name", method: "fill", rect: { x: 0, y: 0, w: 5, h: 5 } }],
};
const mask = (x: number): PiiMask => ({
  kind: "other",
  method: "fill",
  rect: { x, y: 0, w: 10, h: 10 },
});
const record = (x: number) => ({
  kind: "other" as const,
  method: "fill" as const,
  rect: mask(x).rect,
});

describe("FR-EDIT-05, ADR-0009: 保存前のマスクを外す", () => {
  it("画像の外だけにある指示を除く", () => {
    expect(masksInImage([mask(0), mask(500)], { width: 100, height: 100 })).toEqual([mask(0)]);
  });

  it("適用したマスクに id を振り、外すと残りの記録だけを保存済みの記録に足す", () => {
    let u = addUnsaved(null, { before, pii: saved }, [mask(0), mask(20)], [record(0), record(20)]);
    u = addUnsaved(
      u,
      { before: { ...before, bytes: new Uint8Array() }, pii: saved },
      [mask(40)],
      [record(40)],
    );
    expect(u.before).toBe(before);
    expect(u.entries.map((e) => e.id)).toEqual(["applied-1", "applied-2", "applied-3"]);

    const { rest, pii } = removeUnsaved(u, "applied-2");
    expect(rest.map((e) => e.mask)).toEqual([mask(0), mask(40)]);
    expect(pii.applied).toEqual([...saved.applied, record(0), record(40)]);
  });

  it("すべて外すと保存済みの記録そのものに戻る", () => {
    const u = addUnsaved(null, { before, pii: saved }, [mask(0)], [record(0)]);
    expect(removeUnsaved(u, "applied-1")).toEqual({ rest: [], pii: saved });
    expect(removeUnsaved(u, "applied-1").pii).toBe(saved);
  });
});
