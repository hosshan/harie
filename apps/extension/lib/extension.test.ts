// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { collectDomSnapshot } from "./collect";
import { dragRect, elementRect } from "./selection";
import { captureFileName, type RawSnapshot, toImageRect, toImageSnapshot } from "./snapshot";

const raw: RawSnapshot = {
  url: "https://app.example.com/settings",
  viewport: { width: 400, height: 300, devicePixelRatio: 2 },
  elements: [
    { rect: { x: 10, y: 10, w: 100, h: 20 }, role: "button", name: "保存" },
    // 半分以上が切り抜きの外 → 捨てる
    { rect: { x: 90, y: 100, w: 100, h: 20 }, role: "text", text: "外にはみ出す" },
    { rect: { x: 20, y: 110, w: 40, h: 20 }, role: "textbox", piiHint: "email", text: "x" },
  ],
};

describe("DOM スナップショットの座標変換（FR-CAP-03）", () => {
  it("CSS ピクセルを画像のピクセルに直す", () => {
    const s = toImageSnapshot(raw, 2, null, { width: 800, height: 600 });
    expect(s.elements[0]).toEqual({
      rect: { x: 20, y: 20, w: 200, h: 40 },
      role: "button",
      name: "保存",
    });
    expect(s.elements).toHaveLength(3);
  });

  it("切り抜いたときは切り抜きの中の座標にし、ほとんど外の要素は捨てる", () => {
    const crop = toImageRect({ x: 0, y: 90, w: 120, h: 60 }, 2, { width: 800, height: 600 });
    expect(crop).toEqual({ x: 0, y: 180, w: 240, h: 120 });
    const s = toImageSnapshot(raw, 2, crop, { width: 240, height: 120 });
    expect(s.elements).toEqual([
      { rect: { x: 40, y: 40, w: 80, h: 40 }, role: "textbox", text: "x", piiHint: "email" },
    ]);
  });

  it("ファイル名はホスト名と日時（記号はハイフン）", () => {
    expect(captureFileName("https://app.example.com/a?b", new Date(2026, 9, 8, 9, 5, 3))).toBe(
      "app-example-com-20261008-090503.png",
    );
    expect(captureFileName("about:blank", new Date(2026, 0, 1))).toBe(
      "capture-20260101-000000.png",
    );
  });
});

describe("範囲・要素の選択（FR-CAP-02）", () => {
  const vp = { width: 400, height: 300 };
  it("ドラッグの向きによらず矩形にし、画面に収め、小さすぎれば null", () => {
    expect(dragRect({ x: 200, y: 100 }, { x: 50, y: 20 }, vp)).toEqual({
      x: 50,
      y: 20,
      w: 150,
      h: 80,
    });
    expect(dragRect({ x: 390, y: 290 }, { x: 500, y: 500 }, vp)).toEqual({
      x: 390,
      y: 290,
      w: 10,
      h: 10,
    });
    expect(dragRect({ x: 10, y: 10 }, { x: 12, y: 40 }, vp)).toBeNull();
  });
  it("要素には余白を付ける", () => {
    expect(elementRect({ x: 40, y: 300 - 48, w: 160, h: 40 }, vp)).toEqual({
      x: 32,
      y: 244,
      w: 176,
      h: 56,
    });
  });
});

describe("DOM の取得（FR-CAP-03, FR-PII-01）", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("操作できる要素を先に、役割・名前・文字と個人情報の手がかりを取る。パスワードの値は取らない", () => {
    document.body.innerHTML = `
      <h1>通知設定</h1>
      <label for="mail">メールアドレス</label><input id="mail" type="email" value="taro@example.com">
      <input type="password" value="secret-value" aria-label="パスワード">
      <button>変更を保存</button>
      <div><span>担当: 佐藤 花子</span></div>`;
    // jsdom は配置を計算しないので、すべて画面内にあることにする
    let i = 0;
    for (const el of document.querySelectorAll("*")) {
      const y = i++ * 30;
      el.getBoundingClientRect = () => ({
        x: 0,
        y,
        left: 0,
        top: y,
        width: 100,
        height: 20,
        right: 100,
        bottom: y + 20,
        toJSON: () => ({}),
      });
    }
    const s = collectDomSnapshot();
    expect(s.elements.map((e) => [e.role, e.name ?? "", e.text ?? "", e.piiHint ?? null])).toEqual([
      ["textbox", "メールアドレス", "taro@example.com", "email"],
      ["textbox", "パスワード", "", null],
      ["button", "", "変更を保存", null],
      ["heading", "", "通知設定", null],
      ["label", "", "メールアドレス", null],
      ["text", "", "担当: 佐藤 花子", null],
    ]);
    expect(JSON.stringify(s)).not.toContain("secret-value");
  });
});
