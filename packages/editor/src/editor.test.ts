import { createDocument, prepareForSave } from "@harie/model";
import { describe, expect, it } from "vitest";
import { badgeAnchorAt, hitTest } from "./Canvas";
import {
  DRAW_DEFAULTS_KEY,
  loadDrawDefaults,
  saveDrawDefaults,
  styleForNew,
} from "./draw-defaults";
import { boxFrom, handlesFor, movePatch, resizePatch } from "./geometry";
import { editorReducer, initialState, newAnnotationId } from "./history";
import { addDetectedMasks, maskRect, newMaskDraft, toPiiMasks } from "./masks";
import { adoptSuggestionOps, pendingSuggestionIds, rejectSuggestionOps } from "./suggestions";

const base = () =>
  createDocument({
    width: 800,
    height: 600,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-10-07T00:00:00Z"),
  });

const rect = { id: "rect-1", type: "rect", x: 10, y: 10, w: 100, h: 50 };
const arrow = { id: "arrow-1", type: "arrow", from: { x: 0, y: 200 }, to: { x: 200, y: 200 } };

describe("editorReducer（FR-EDIT-07）", () => {
  it("操作を適用し、元に戻す・やり直すができる", () => {
    let s = initialState(base());
    s = editorReducer(s, {
      type: "apply",
      ops: [{ op: "add", annotation: rect }],
      select: "rect-1",
    });
    expect(s.doc.annotations).toHaveLength(1);
    expect(s.selectedIds).toEqual(["rect-1"]);
    s = editorReducer(s, {
      type: "apply",
      ops: [{ op: "update", id: "rect-1", patch: { x: 50 } }],
    });
    s = editorReducer(s, { type: "undo" });
    expect(s.doc.annotations[0]).toMatchObject({ x: 10 });
    s = editorReducer(s, { type: "undo" });
    expect(s.doc.annotations).toHaveLength(0);
    expect(s.selectedIds).toEqual([]);
    s = editorReducer(s, { type: "redo" });
    s = editorReducer(s, { type: "redo" });
    expect(s.doc.annotations[0]).toMatchObject({ x: 50 });
    expect(editorReducer(s, { type: "redo" })).toBe(s);
  });

  it("新しい操作をするとやり直しの履歴は消える", () => {
    let s = initialState(base());
    s = editorReducer(s, { type: "apply", ops: [{ op: "add", annotation: rect }] });
    s = editorReducer(s, { type: "undo" });
    s = editorReducer(s, { type: "apply", ops: [{ op: "add", annotation: arrow }] });
    expect(s.future).toHaveLength(0);
    expect(s.doc.annotations.map((a) => a.id)).toEqual(["arrow-1"]);
  });

  it("失敗した操作は状態を変えずにエラーを残す", () => {
    let s = initialState(base());
    s = editorReducer(s, { type: "apply", ops: [{ op: "add", annotation: rect }] });
    const before = s.doc;
    s = editorReducer(s, { type: "apply", ops: [{ op: "remove", id: "nope" }] });
    expect(s.doc).toBe(before);
    expect(s.error?.message).toContain("nope");
  });

  it("ID は既存と重ならない", () => {
    let s = initialState(base());
    s = editorReducer(s, { type: "apply", ops: [{ op: "add", annotation: rect }] });
    expect(newAnnotationId(s.doc, "rect")).toBe("rect-2");
  });
});

describe("geometry", () => {
  it("移動は矢印の両端も動かす", () => {
    const r = editorReducer(initialState(base()), {
      type: "apply",
      ops: [{ op: "add", annotation: arrow }],
    });
    const a = r.doc.annotations[0];
    if (a === undefined) throw new Error();
    expect(movePatch(a, 10, -5)).toEqual({ from: { x: 10, y: 195 }, to: { x: 210, y: 195 } });
  });

  it("角のハンドルは反対側の角を固定し、裏返しても幅・高さは正", () => {
    const s = editorReducer(initialState(base()), {
      type: "apply",
      ops: [{ op: "add", annotation: rect }],
    });
    const a = s.doc.annotations[0];
    if (a === undefined) throw new Error();
    expect(handlesFor(a)).toHaveLength(8);
    expect(resizePatch(a, "se", { x: 210, y: 110 })).toEqual({ x: 10, y: 10, w: 200, h: 100 });
    expect(resizePatch(a, "nw", { x: 200, y: 100 })).toEqual({ x: 110, y: 60, w: 90, h: 40 });
    expect(boxFrom({ x: 5, y: 5 }, { x: 1, y: 1 })).toEqual({ x: 1, y: 1, w: 4, h: 4 });
  });

  it("当たり判定は上に描かれた注釈を優先し、矢印は線の近くだけ当たる", () => {
    const s = editorReducer(initialState(base()), {
      type: "apply",
      ops: [
        { op: "add", annotation: rect },
        { op: "add", annotation: { ...rect, id: "rect-2", x: 50 } },
        { op: "add", annotation: arrow },
      ],
    });
    expect(hitTest(s.doc, { x: 60, y: 20 }, 4)?.id).toBe("rect-2");
    expect(hitTest(s.doc, { x: 100, y: 203 }, 4)?.id).toBe("arrow-1");
    expect(hitTest(s.doc, { x: 100, y: 260 }, 4)).toBeUndefined();
  });
});

describe("番号の anchor（ADR-0011）", () => {
  const badge = {
    id: "badge-1",
    type: "badge",
    x: 0,
    y: 0,
    number: 1,
    anchor: { annotationId: "rect-1" },
  };

  it("枠を動かすと、紐付けた番号も枠の左上の外側に付いてくる", () => {
    const placed = editorReducer(initialState(base()), {
      type: "apply",
      ops: [
        { op: "add", annotation: { ...rect, x: 200, y: 200 } },
        { op: "add", annotation: badge },
      ],
    });
    expect(placed.doc.annotations[1]).toMatchObject({ x: 160, y: 160 });
    const moved = editorReducer(placed, {
      type: "apply",
      ops: [{ op: "update", id: "rect-1", patch: { x: 300 } }],
    });
    expect(moved.doc.annotations[1]).toMatchObject({ x: 260, y: 160 });
  });

  it("番号だけを動かすと紐付けを外す", () => {
    expect(movePatch({ ...badge, type: "badge" } as const, 5, 5)).toEqual({
      x: 5,
      y: 5,
      anchor: undefined,
    });
  });

  it("枠の上で番号を置くと、その枠に紐付ける", () => {
    const doc = editorReducer(initialState(base()), {
      type: "apply",
      ops: [{ op: "add", annotation: rect }],
    }).doc;
    expect(badgeAnchorAt(doc, { x: 20, y: 20 }, 0)).toEqual({ anchor: { annotationId: "rect-1" } });
    expect(badgeAnchorAt(doc, { x: 500, y: 500 }, 0)).toEqual({});
  });
});

describe("保存後のリビジョン", () => {
  it("saved は履歴中のドキュメントにも新しいリビジョンを反映する", () => {
    let s = initialState(base());
    s = editorReducer(s, { type: "apply", ops: [{ op: "add", annotation: rect }] });
    const meta = { ...s.doc.meta, updatedAt: "2026-10-08T00:00:00.000Z" };
    s = editorReducer(s, { type: "saved", revision: 3, meta });
    expect(s.doc.revision).toBe(3);
    s = editorReducer(s, { type: "undo" });
    expect(s.doc.revision).toBe(3);
    expect(s.doc.annotations).toHaveLength(0);
  });
});

describe("個人情報のマスク（FR-EDIT-05）", () => {
  const canvas = { width: 800, height: 600 };

  it("範囲は画像内に収め、画像の外だけなら作らない", () => {
    expect(maskRect({ x: 790, y: -10 }, { x: 900, y: 20 }, canvas)).toEqual({
      x: 790,
      y: 0,
      w: 10,
      h: 20,
    });
    expect(maskRect({ x: 900, y: 10 }, { x: 950, y: 40 }, canvas)).toBeNull();
    // クリックだけなら 1 行分の大きさで作る
    expect(maskRect({ x: 10, y: 10 }, { x: 11, y: 11 }, canvas)).toEqual({
      x: 10,
      y: 10,
      w: 160,
      h: 32,
    });
  });

  it("既定は塗りつぶし。ダミーの文字は置き換えのときだけ渡す", () => {
    const a = newMaskDraft([], { x: 0, y: 0, w: 10, h: 10 });
    const b = { ...newMaskDraft([a], { x: 20, y: 0, w: 10, h: 10 }), replacement: "佐藤" };
    expect(a.method).toBe("fill");
    expect(b.id).not.toBe(a.id);
    expect(toPiiMasks([a, b])).toEqual([
      { kind: "other", method: "fill", rect: a.rect },
      { kind: "other", method: "fill", rect: b.rect },
    ]);
    expect(toPiiMasks([{ ...b, method: "replace" }])[0]).toMatchObject({ replacement: "佐藤" });
  });

  it("適用の記録は元に戻す・やり直すで消えない（ADR-0007）", () => {
    let s = initialState(base());
    s = editorReducer(s, { type: "apply", ops: [{ op: "add", annotation: rect }] });
    const pii = { applied: [{ kind: "other" as const, method: "fill" as const, rect: rect }] };
    s = editorReducer(s, { type: "piiApplied", pii: { ...s.doc.pii, ...pii } });
    s = editorReducer(s, { type: "undo" });
    expect(s.doc.annotations).toHaveLength(0);
    expect(s.doc.pii.applied).toHaveLength(1);
    s = editorReducer(s, { type: "redo" });
    expect(s.doc.pii.applied).toHaveLength(1);
  });
});

describe("AI の提案の採用・却下（FR-AI-02）", () => {
  const box = { id: "ai-box-1", type: "rect", status: "suggested", x: 10, y: 10, w: 100, h: 40 };
  const note = {
    id: "ai-note-1",
    type: "callout",
    status: "suggested",
    x: 200,
    y: 10,
    w: 200,
    text: "保存します",
  };
  const withSuggestions = () => {
    const s = editorReducer(initialState(base()), {
      type: "apply",
      ops: [
        { op: "add", annotation: box },
        { op: "add", annotation: note },
      ],
    });
    expect(s.error).toBeNull();
    return s;
  };

  it("採用するとフラグが外れて保存され、直した内容も残る", () => {
    let s = withSuggestions();
    s = editorReducer(s, {
      type: "apply",
      ops: [{ op: "update", id: "ai-note-1", patch: { text: "保存ボタンを押します" } }],
    });
    s = editorReducer(s, {
      type: "apply",
      ops: adoptSuggestionOps(s.doc, ["ai-box-1", "ai-note-1"]),
    });
    expect(pendingSuggestionIds(s.doc, ["ai-box-1", "ai-note-1"])).toEqual([]);
    const saved = prepareForSave(s.doc);
    expect(saved.annotations.map((a) => a.id)).toEqual(["ai-box-1", "ai-note-1"]);
    expect(saved.annotations[1]).toMatchObject({ text: "保存ボタンを押します" });
    expect(JSON.parse(JSON.stringify(saved)).annotations[0].status).toBeUndefined();
  });

  it("却下すると消え、採用済み・存在しないものには何もしない", () => {
    let s = withSuggestions();
    s = editorReducer(s, { type: "apply", ops: adoptSuggestionOps(s.doc, ["ai-box-1"]) });
    s = editorReducer(s, {
      type: "apply",
      ops: rejectSuggestionOps(s.doc, ["ai-box-1", "ai-note-1", "nothing"]),
    });
    expect(s.doc.annotations.map((a) => a.id)).toEqual(["ai-box-1"]);
    expect(adoptSuggestionOps(s.doc, ["ai-box-1"])).toEqual([]);
  });

  it("未採用の提案は保存しない", () => {
    expect(prepareForSave(withSuggestions().doc).annotations).toEqual([]);
  });
});

describe("検出した個人情報のマスク（FR-PII-01）", () => {
  it("検出した種別を記録に残す。手で指定した範囲は other", () => {
    const masks = toPiiMasks([
      {
        id: "mask-1",
        rect: { x: 0, y: 0, w: 10, h: 10 },
        method: "replace",
        replacement: "user1@example.com",
        kind: "email",
      },
      { id: "mask-2", rect: { x: 0, y: 0, w: 10, h: 10 }, method: "fill", replacement: "" },
    ]);
    expect(masks.map((m) => m.kind)).toEqual(["email", "other"]);
  });

  it("検出結果を既存の下書きに足し、ID を重ねない", () => {
    const manual = newMaskDraft([], { x: 0, y: 0, w: 10, h: 10 });
    const next = addDetectedMasks(
      [manual],
      [
        {
          rect: { x: 5, y: 5, w: 20, h: 8 },
          method: "replace",
          replacement: "佐藤 花子",
          kind: "name",
        },
        { rect: { x: 50, y: 5, w: 20, h: 20 }, method: "fill", replacement: "", kind: "face" },
      ],
    );
    expect(next.map((d) => [d.id, d.kind, d.method])).toEqual([
      ["mask-1", undefined, "fill"],
      ["mask-2", "name", "replace"],
      ["mask-3", "face", "fill"],
    ]);
  });
});

describe("次に描く注釈の初期値（FR-EDIT-01・FR-EDIT-03）", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it("記録した線の太さ・文字サイズを読み戻す", () => {
    const storage = memory();
    saveDrawDefaults({ strokeWidth: 6, fontSize: 36, badgeFontSize: 16 }, storage);
    expect(loadDrawDefaults(storage)).toEqual({ strokeWidth: 6, fontSize: 36, badgeFontSize: 16 });
  });

  it("未記録・壊れた値・範囲外の値は無視する", () => {
    const storage = memory();
    expect(loadDrawDefaults(storage)).toEqual({});
    storage.setItem(DRAW_DEFAULTS_KEY, "{");
    expect(loadDrawDefaults(storage)).toEqual({});
    storage.setItem(DRAW_DEFAULTS_KEY, JSON.stringify({ strokeWidth: -1 }));
    expect(loadDrawDefaults(storage)).toEqual({});
    expect(loadDrawDefaults(undefined)).toEqual({});
  });

  it("線の太さは四角・楕円・矢印に、文字サイズはテキスト・吹き出しに、番号の大きさは番号に付ける", () => {
    const d = { strokeWidth: 6, fontSize: 36, badgeFontSize: 16 };
    expect(styleForNew("rect", d)).toEqual({ strokeWidth: 6 });
    expect(styleForNew("arrow", d)).toEqual({ strokeWidth: 6 });
    expect(styleForNew("callout", d)).toEqual({ fontSize: 36 });
    expect(styleForNew("badge", d)).toEqual({ fontSize: 16 });
    // 吹き出しの文字サイズは番号に引き継がない
    expect(styleForNew("badge", { fontSize: 36 })).toBeUndefined();
    expect(styleForNew("rect", { fontSize: 36 })).toBeUndefined();
  });
});
