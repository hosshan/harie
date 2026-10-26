import { readFileSync } from "node:fs";
import { readHarie } from "@harie/format";
import { createDocument, type HarieDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { pageImageInfo } from "./page-copy";
import { annotationText, fileNameFromUrl, isHarieImageUrl, pageScriptMatches } from "./page-image";

describe("ページ上の Harie 画像の見分け方（FR-FILE-13）", () => {
  it("ファイル名が <名前>.harie.<拡張子> の画像の URL を Harie 画像とみなす", () => {
    expect(isHarieImageUrl("https://example.com/a/notification.harie.png")).toBe(true);
    expect(isHarieImageUrl("https://example.com/a/guide.HARIE.JPEG?raw=true")).toBe(true);
    expect(isHarieImageUrl("https://example.com/a/%E8%A8%AD%E5%AE%9A.harie.jpg")).toBe(true);
    expect(isHarieImageUrl("https://example.com/a/notification.png")).toBe(false);
    expect(isHarieImageUrl("https://example.com/harie.png")).toBe(false);
    expect(isHarieImageUrl("not a url")).toBe(false);
  });

  it("エディタで開くときのファイル名は URL の最後の部分", () => {
    expect(fileNameFromUrl("https://example.com/x/settings.harie.png?raw=true")).toBe(
      "settings.harie.png",
    );
    expect(fileNameFromUrl("https://example.com/image?id=1")).toBe("image.png");
  });
});

describe("ページ用スクリプトを入れる先（FR-FILE-12, FR-FILE-13）", () => {
  it("許可されたサイトだけに入れる。全サイトが許可されていれば全サイト", () => {
    expect(pageScriptMatches([])).toEqual([]);
    expect(
      pageScriptMatches(["https://github.com/*", "https://*.githubusercontent.com/*"]),
    ).toEqual(["https://github.com/*", "https://*.githubusercontent.com/*"]);
    expect(pageScriptMatches(["https://github.com/*", "<all_urls>"])).toEqual(["<all_urls>"]);
    expect(pageScriptMatches(["*://*/*"])).toEqual(["<all_urls>"]);
    // 関係のないサイトの権限では入れない
    expect(pageScriptMatches(["https://example.com/*"])).toEqual([]);
  });
});

describe("説明文をまとめてコピーするテキスト（FR-FILE-12）", () => {
  it("番号の順に「番号. 吹き出しの文」を並べ、紐付かない文字はそのあとに並べる", () => {
    const doc: HarieDocument = {
      ...createDocument({ width: 100, height: 100, now: new Date("2026-10-26T00:00:00Z") }),
      annotations: [
        { id: "r2", type: "rect", x: 0, y: 0, w: 10, h: 10 },
        { id: "r1", type: "rect", x: 0, y: 0, w: 10, h: 10 },
        { id: "b2", type: "badge", x: 0, y: 0, number: 2, anchor: { annotationId: "r2" } },
        { id: "b1", type: "badge", x: 0, y: 0, number: 1, anchor: { annotationId: "r1" } },
        {
          id: "c2",
          type: "callout",
          x: 0,
          y: 0,
          w: 10,
          text: "保存します",
          anchor: { annotationId: "r2", side: "right" },
        },
        {
          id: "c1",
          type: "callout",
          x: 0,
          y: 0,
          w: 10,
          text: " メールを選びます ",
          anchor: { annotationId: "r1", side: "right" },
        },
        { id: "t1", type: "text", x: 0, y: 0, text: "補足" },
        { id: "t2", type: "text", x: 0, y: 0, text: "  " },
      ],
    };
    expect(annotationText(doc)).toBe("1. メールを選びます\n2. 保存します\n- 補足");
    expect(annotationText({ ...doc, meta: { ...doc.meta, title: "通知設定" } })).toMatch(
      /^通知設定\n\n1\. /,
    );
  });

  it("見本の Harie ファイルから、番号付きの手順のテキストを作れる", () => {
    const bytes = readFileSync(
      new URL("../../site/src/assets/tasklane-notifications.harie.png", import.meta.url),
    );
    const read = readHarie(new Uint8Array(bytes));
    if (read.kind !== "harie") throw new Error(read.kind);
    const lines = annotationText(read.doc).split("\n");
    expect(lines[0]).toBe("通知設定");
    expect(lines.filter((l) => /^\d\. \S/.test(l))).toHaveLength(3);
  });
});

describe("説明文をその場でコピーする位置（FR-FILE-12）", () => {
  it("吹き出しと文字の枠を、画像に対する割合で返す。提案中と空の文字は除く", () => {
    const doc: HarieDocument = {
      ...createDocument({ width: 200, height: 100, now: new Date("2026-10-26T00:00:00Z") }),
      annotations: [
        { id: "r1", type: "rect", x: 0, y: 0, w: 10, h: 10 },
        { id: "c1", type: "callout", x: 100, y: 50, w: 50, text: "保存します" },
        { id: "c2", type: "callout", x: 0, y: 0, w: 50, text: "提案", status: "suggested" },
        { id: "t1", type: "text", x: 20, y: 10, text: "  " },
      ],
    };
    const info = pageImageInfo(doc);
    if (!info.harie) throw new Error("not harie");
    expect(info.targets).toHaveLength(1);
    expect(info.targets[0]).toMatchObject({ x: 0.5, y: 0.5, w: 0.25, text: "保存します" });
    expect(info.targets[0]?.h).toBeGreaterThan(0);
    expect(info.all).toBe("- 保存します");
  });

  it("切り抜いた画像では、切り抜いた範囲に対する割合にする", () => {
    const base = createDocument({ width: 200, height: 100, now: new Date("2026-10-26T00:00:00Z") });
    const doc: HarieDocument = {
      ...base,
      canvas: { ...base.canvas, crop: { x: 100, y: 0, w: 100, h: 100 } },
      annotations: [{ id: "c1", type: "callout", x: 150, y: 20, w: 25, text: "a" }],
    };
    const info = pageImageInfo(doc);
    expect(info.harie && info.targets[0]).toMatchObject({ x: 0.5, y: 0.2, w: 0.25 });
  });
});
