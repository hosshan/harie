import { readFileSync } from "node:fs";
import { readHarie } from "@harie/format";
import { createDocument, type HarieDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import {
  annotationText,
  fileNameFromUrl,
  githubViewscreenImages,
  isGitHubImageRequest,
  isHarieImageUrl,
  pageScriptMatches,
} from "./page-image";

const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");

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

  it("注釈データをページに返すのは GitHub のページで GitHub の画像を読むときだけ", () => {
    const raw = "https://raw.githubusercontent.com/o/r/abc/docs/a.harie.png";
    expect(isGitHubImageRequest("https://github.com/o/r/pull/1/files", raw)).toBe(true);
    expect(isGitHubImageRequest("https://github.com/o/r/blob/main/a.harie.png", raw)).toBe(true);
    expect(isGitHubImageRequest("https://evil.example/", raw)).toBe(false);
    expect(isGitHubImageRequest(undefined, raw)).toBe(false);
    expect(
      isGitHubImageRequest("https://github.com/", "https://intranet.example/a.harie.png"),
    ).toBe(false);
  });
});

describe("GitHub の差分の画像（FR-FILE-12）", () => {
  it("viewscreen の iframe の URL から、ファイルのパスと画像の URL を取り出す", () => {
    const raw = "https://raw.githubusercontent.com/o/r/abc/docs/a.harie.png";
    const src = `https://viewscreen.githubusercontent.com/added/img?color_mode=auto&commit=abc&enc_url=${hex(raw)}&path=docs%2Fa.harie.png&repository_id=1#x`;
    expect(githubViewscreenImages(src)).toEqual({ path: "docs/a.harie.png", urls: [raw] });
  });

  it("変更された画像は 2 枚の URL を順に返す。http(s) でないものと壊れた値は捨てる", () => {
    const a = "https://raw.githubusercontent.com/o/r/1/a.harie.png";
    const b = "https://raw.githubusercontent.com/o/r/2/a.harie.png";
    const src = `https://viewscreen.githubusercontent.com/modified/img?enc_url1=${hex(a)}&enc_url2=${hex(b)}&enc_url3=${hex("javascript:alert(1)")}&enc_url4=zz&path=a.harie.png`;
    expect(githubViewscreenImages(src)?.urls).toEqual([a, b]);
    expect(githubViewscreenImages("https://github.com/o/r")).toBeNull();
  });
});

describe("注釈データのテキスト（FR-FILE-12）", () => {
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
