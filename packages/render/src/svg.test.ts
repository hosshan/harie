import { applyOps, createDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import {
  badgeAnchorPosition,
  buildSvg,
  calloutConnector,
  estimateTextWidth,
  layoutAnchors,
  wrapText,
} from "./svg";

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

describe("buildSvg", () => {
  it("FR-EDIT-01〜04: 各種注釈を SVG に変換する（スナップショット）", () => {
    const svg = buildSvg(
      doc([
        { id: "r", type: "rect", x: 10, y: 20, w: 100, h: 50, style: { radius: 8 } },
        { id: "e", type: "ellipse", x: 200, y: 20, w: 80, h: 40 },
        { id: "a", type: "arrow", from: { x: 300, y: 300 }, to: { x: 400, y: 350 } },
        { id: "t", type: "text", x: 10, y: 100, text: "保存<ボタン>&\n2行目" },
        {
          id: "c",
          type: "callout",
          x: 400,
          y: 100,
          w: 200,
          text: "メール通知をオンにすると届きます",
        },
        { id: "b", type: "badge", x: 5, y: 5, number: 1 },
        { id: "s", type: "spotlight", x: 10, y: 20, w: 100, h: 50 },
      ]),
    );
    expect(svg).toMatchSnapshot();
  });

  it("テキストを XML エスケープする", () => {
    const svg = buildSvg(doc([{ id: "t", type: "text", x: 0, y: 0, text: '<script>"&' }]));
    expect(svg).toContain("&lt;script&gt;&quot;&amp;");
    expect(svg).not.toContain("<script>");
  });

  it("FR-AI-02: AI 提案中の注釈は既定で描かない", () => {
    const d = doc([{ id: "s", type: "rect", x: 0, y: 0, w: 1, h: 1, status: "suggested" }]);
    expect(buildSvg(d)).not.toContain("<rect");
    expect(buildSvg(d, { includeSuggested: true })).toContain("<rect");
  });

  it("トリミング範囲を viewBox と出力サイズに反映する", () => {
    const d = { ...doc([]), canvas: { ...doc([]).canvas, crop: { x: 10, y: 20, w: 300, h: 200 } } };
    expect(buildSvg(d)).toContain('width="300" height="200" viewBox="10 20 300 200"');
  });

  it("可逆ぼかしはベース画像がない場合は灰色の矩形で示す", () => {
    const d = doc([{ id: "b", type: "blur", x: 0, y: 0, w: 10, h: 10, method: "blur" }]);
    expect(buildSvg(d)).toContain('fill="#888888"');
    expect(buildSvg(d, { baseImageHref: "data:image/png;base64,AA==" })).toContain(
      "feGaussianBlur",
    );
  });
});

describe("吹き出しの anchor（FR-EDIT-03）", () => {
  const target = { x: 100, y: 100, w: 200, h: 50 };

  it("縦の範囲が重なれば、向かい合う辺を重なりの中央で水平に結ぶ", () => {
    expect(calloutConnector({ x: 400, y: 110, w: 100, h: 80 }, target)).toEqual({
      from: { x: 400, y: 130 },
      to: { x: 300, y: 130 },
    });
    expect(calloutConnector({ x: 0, y: 60, w: 50, h: 60 }, target)?.to).toEqual({
      x: 100,
      y: 110,
    });
  });

  it("下にあれば上辺から対象の下辺へ、横の範囲が重ならなければ近い角へ向ける", () => {
    expect(calloutConnector({ x: 150, y: 200, w: 300, h: 40 }, target)).toEqual({
      from: { x: 225, y: 200 },
      to: { x: 225, y: 150 },
    });
    expect(calloutConnector({ x: 320, y: 300, w: 100, h: 40 }, target)).toEqual({
      from: { x: 320, y: 300 },
      to: { x: 300, y: 150 },
    });
  });

  it("重なっていれば線を引かない", () => {
    expect(calloutConnector({ x: 150, y: 120, w: 50, h: 20 }, target)).toBeNull();
  });

  it("anchor の対象へ矢印を描き、対象がない・提案中で非表示なら描かない", () => {
    const callout = {
      id: "c",
      type: "callout",
      x: 400,
      y: 100,
      w: 200,
      text: "説明",
      anchor: { annotationId: "r", side: "right" },
    };
    const lines = (svg: string) => (svg.match(/<line /g) ?? []).length;
    expect(lines(buildSvg(doc([{ id: "r", type: "rect", ...target }, callout])))).toBe(1);
    expect(lines(buildSvg(doc([callout])))).toBe(0);
    const hidden = doc([{ id: "r", type: "rect", ...target, status: "suggested" }, callout]);
    expect(lines(buildSvg(hidden))).toBe(0);
    expect(lines(buildSvg(hidden, { includeSuggested: true }))).toBe(1);
  });
});

describe("番号の anchor（ADR-0011）", () => {
  const box = { id: "r", type: "rect", x: 200, y: 200, w: 100, h: 40 } as const;
  const badge = {
    id: "b",
    type: "badge",
    x: 0,
    y: 0,
    number: 1,
    anchor: { annotationId: "r" },
  } as const;

  it("枠の左上の角の完全に外側に置く（既定の大きさで角から 40 ずらす）", () => {
    // 直径 = 24 × 1.6 = 38.4、線の太さの半分 = 2
    expect(badgeAnchorPosition(badge, box)).toEqual({ x: 200 - 38.4 - 2, y: 200 - 38.4 - 2 });
  });

  it("画像の外に出るときは左の辺の外側、それも出るときは上の辺の外側に置く", () => {
    expect(badgeAnchorPosition(badge, { ...box, y: 10 })).toEqual({ x: 200 - 40.4, y: 10 });
    expect(badgeAnchorPosition(badge, { ...box, x: 10 })).toEqual({ x: 10, y: 200 - 40.4 });
  });

  it("x, y を計算した位置にそろえ、紐付け先がなければそのままにする", () => {
    const laid = layoutAnchors(doc([box, badge]));
    expect(laid.annotations[1]).toMatchObject({ x: 160, y: 160 });
    const orphan = doc([{ ...badge, x: 5, y: 6 }]);
    expect(layoutAnchors(orphan)).toBe(orphan);
  });

  it("描画は保存されている x, y でなく紐付け先から決める", () => {
    const stale = doc([box, { ...badge, x: 0, y: 0 }]);
    expect(buildSvg(stale)).toBe(buildSvg(layoutAnchors(stale)));
  });
});

describe("文字の折り返し", () => {
  it("全角は 1em、半角は 0.6em で見積もる", () => {
    expect(estimateTextWidth("あa", 10)).toBe(16);
  });

  it("幅に収まるよう文字単位で折り返し、改行も保つ", () => {
    expect(wrapText("あいうえおかき", 10, 30)).toEqual(["あいう", "えおか", "き"]);
    expect(wrapText("ab\ncd", 10, 100)).toEqual(["ab", "cd"]);
  });
});
