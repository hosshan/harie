import { applyOps, createDocument } from "@anoi/model";
import { describe, expect, it } from "vitest";
import { buildSvg, estimateTextWidth, wrapText } from "./svg";

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

describe("文字の折り返し", () => {
  it("全角は 1em、半角は 0.6em で見積もる", () => {
    expect(estimateTextWidth("あa", 10)).toBe(16);
  });

  it("幅に収まるよう文字単位で折り返し、改行も保つ", () => {
    expect(wrapText("あいうえおかき", 10, 30)).toEqual(["あいう", "えおか", "き"]);
    expect(wrapText("ab\ncd", 10, 100)).toEqual(["ab", "cd"]);
  });
});
