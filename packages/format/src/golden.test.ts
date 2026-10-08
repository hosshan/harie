// 形式 v0.1 のゴールデンファイルによる後方互換テスト（FR-FILE-07, NFR-DATA-02）
// ゴールデンファイルは一度作ったら再生成しない。形式を変えたら新しいバージョンのディレクトリを追加する。
// 生成: GENERATE_GOLDEN=1 pnpm exec vitest run --project format golden
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readHarie, writeHarie } from "./harie-file";
import { DOC_ID, fixture, sampleDoc } from "./test-utils/fixtures";

const goldens = [
  { file: "v0.1/sample.anoi.jpg", rendered: "rendered.jpg", base: "base.jpg" },
  { file: "v0.1/sample.anoi.png", rendered: "rendered.png", base: "base.png" },
];

describe.each(goldens)("ゴールデン $file", ({ file, rendered, base }) => {
  const url = new URL(`../fixtures/${file}`, import.meta.url);

  if (process.env.GENERATE_GOLDEN === "1" && !existsSync(url)) {
    mkdirSync(new URL(".", url), { recursive: true });
    writeFileSync(
      url,
      writeHarie({ rendered: fixture(rendered), base: fixture(base), doc: sampleDoc() }),
    );
  }

  it("現在の実装で読め、内容が変わらない", () => {
    const r = readHarie(fixture(file));
    expect(r.kind).toBe("harie");
    if (r.kind !== "harie") return;
    expect(r.descriptor.formatVersion).toBe("0.1");
    expect(r.doc.docId).toBe(DOC_ID);
    expect(r.doc.annotations.map((a) => a.id)).toEqual(["a1", "t1"]);
    expect(Buffer.from(r.base.bytes).equals(Buffer.from(fixture(base)))).toBe(true);
  });
});
