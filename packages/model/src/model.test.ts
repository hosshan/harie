import { describe, expect, it } from "vitest";
import { createDocument, prepareForSave } from "./document";
import { migrateDocument } from "./migrate";
import { applyOps } from "./ops";
import type { AnoiDocument } from "./schema";

const DOC_ID = "c8be77cd-bc6d-4747-bf15-12e345a4b522";
const NOW = new Date("2026-10-07T08:00:00Z");

function sampleDoc(): AnoiDocument {
  const doc = createDocument({ width: 1280, height: 800, docId: DOC_ID, now: NOW });
  const added = applyOps(doc, [
    { op: "add", annotation: { id: "a1", type: "rect", x: 10, y: 10, w: 100, h: 50 } },
    { op: "add", annotation: { id: "b1", type: "badge", x: 5, y: 5, number: 3 } },
    { op: "add", annotation: { id: "t1", type: "text", x: 200, y: 20, text: "保存ボタン" } },
    { op: "add", annotation: { id: "b2", type: "badge", x: 50, y: 5, number: 7 } },
  ]);
  if (!added.ok) throw new Error(added.error.message);
  return added.value;
}

describe("注釈ドキュメントの作成", () => {
  it("既定値が入った最新スキーマのドキュメントを作る", () => {
    const doc = createDocument({ width: 100, height: 50, docId: DOC_ID, now: NOW });
    expect(doc).toMatchObject({
      schemaVersion: "0.1",
      docId: DOC_ID,
      revision: 0,
      canvas: { width: 100, height: 50, devicePixelRatio: 1, crop: null },
      annotations: [],
      pii: { applied: [] },
    });
  });

  it("docId を省略すると UUID を生成する", () => {
    expect(createDocument({ width: 1, height: 1 }).docId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("保存準備でリビジョンを進め、未採用の AI 提案を除く（FR-AI-02）", () => {
    const doc = applyOps(sampleDoc(), [
      {
        op: "add",
        annotation: { id: "s1", type: "rect", x: 0, y: 0, w: 1, h: 1, status: "suggested" },
      },
    ]);
    if (!doc.ok) throw new Error();
    const saved = prepareForSave(doc.value, { now: new Date("2026-10-08T00:00:00Z") });
    expect(saved.revision).toBe(1);
    expect(saved.meta.updatedAt).toBe("2026-10-08T00:00:00.000Z");
    expect(saved.annotations.map((a) => a.id)).not.toContain("s1");
  });
});

describe("操作（applyOps）", () => {
  it("更新は既存の値にマージし、スキーマで検証する", () => {
    const r = applyOps(sampleDoc(), [{ op: "update", id: "t1", patch: { text: "登録ボタン" } }]);
    expect(r.ok && r.value.annotations.find((a) => a.id === "t1")).toMatchObject({
      text: "登録ボタン",
    });
    const bad = applyOps(sampleDoc(), [{ op: "update", id: "a1", patch: { w: -1 } }]);
    expect(bad.ok).toBe(false);
  });

  it("id と type は変更できない", () => {
    expect(applyOps(sampleDoc(), [{ op: "update", id: "a1", patch: { type: "ellipse" } }]).ok).toBe(
      false,
    );
  });

  it("重複 id の追加と存在しない id の操作はエラー", () => {
    const dup = applyOps(sampleDoc(), [
      { op: "add", annotation: { id: "a1", type: "text", x: 0, y: 0, text: "" } },
    ]);
    expect(dup).toMatchObject({ ok: false, error: { opIndex: 0 } });
    expect(applyOps(sampleDoc(), [{ op: "remove", id: "zz" }]).ok).toBe(false);
  });

  it("途中で失敗したら何も適用しない（原子的）", () => {
    const doc = sampleDoc();
    const r = applyOps(doc, [
      { op: "remove", id: "a1" },
      { op: "remove", id: "zz" },
    ]);
    expect(r).toMatchObject({ ok: false, error: { opIndex: 1 } });
    expect(doc.annotations).toHaveLength(4);
  });

  it("不正な形の操作（外部入力）を検証で弾く", () => {
    expect(applyOps(sampleDoc(), [{ op: "explode" }]).ok).toBe(false);
    expect(applyOps(sampleDoc(), ["remove a1"]).ok).toBe(false);
  });

  it("並べ替えは描画順を変える", () => {
    const r = applyOps(sampleDoc(), [{ op: "reorder", id: "t1", index: 0 }]);
    expect(r.ok && r.value.annotations.map((a) => a.id)).toEqual(["t1", "a1", "b1", "b2"]);
  });

  it("FR-EDIT-04: 番号バッジを配列順に 1 から振り直す", () => {
    const r = applyOps(sampleDoc(), [{ op: "renumber" }]);
    const numbers = r.ok
      ? r.value.annotations.flatMap((a) => (a.type === "badge" ? [a.number] : []))
      : [];
    expect(numbers).toEqual([1, 2]);
  });
});

describe("FR-FILE-07: マイグレーション", () => {
  it("現行バージョンはそのまま検証して読む", () => {
    const r = migrateDocument(JSON.parse(JSON.stringify(sampleDoc())));
    expect(r.ok).toBe(true);
  });

  it("同じメジャーの新しいマイナー版は、未知のフィールドを保持して読む", () => {
    const raw = {
      ...JSON.parse(JSON.stringify(sampleDoc())),
      schemaVersion: "0.12",
      futureField: { x: 1 },
    };
    raw.annotations[0].futureProp = "keep";
    const r = migrateDocument(raw);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value).toMatchObject({ futureField: { x: 1 } });
    expect(r.value.annotations[0]).toMatchObject({ futureProp: "keep" });
  });

  it("未知のメジャー版・不正な入力はエラー（例外にしない）", () => {
    expect(migrateDocument({ ...sampleDoc(), schemaVersion: "1.0" })).toMatchObject({
      ok: false,
      error: { kind: "UnsupportedVersion" },
    });
    expect(migrateDocument(null)).toMatchObject({ ok: false, error: { kind: "Invalid" } });
    expect(migrateDocument({ schemaVersion: "0.1" })).toMatchObject({
      ok: false,
      error: { kind: "Invalid" },
    });
  });
});
