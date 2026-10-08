import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHarie } from "@harie/format";
import { describe, expect, it } from "vitest";
import { CliError, create, extract, inspect, mask, render } from "./commands";

const FIXTURES = new URL("../../../packages/format/fixtures/", import.meta.url);
const NOW = new Date("2026-10-07T00:00:00Z");

function workdir(): string {
  const dir = mkdtempSync(join(tmpdir(), "harie-cli-"));
  writeFileSync(join(dir, "screen.png"), readFileSync(new URL("base.png", FIXTURES)));
  writeFileSync(join(dir, "screen.jpg"), readFileSync(new URL("base.jpg", FIXTURES)));
  return dir;
}

const readFile = (p: string) => readHarie(new Uint8Array(readFileSync(p)));

describe("harie CLI", () => {
  it.each(["png", "jpg"])(
    "FR-FILE-08: 普通の画像（%s）から Harie ファイルを作り、名前規則で保存する",
    async (ext) => {
      const dir = workdir();
      const out = await create(join(dir, `screen.${ext}`), { title: "設定", now: NOW });
      expect(out).toBe(join(dir, `screen.harie.${ext}`));
      const read = readFile(out);
      expect(read.kind).toBe("harie");
      if (read.kind !== "harie") return;
      expect(read.doc.canvas).toMatchObject({ width: 64, height: 40 });
      expect(read.doc.meta.title).toBe("設定");
      // ベース画像は読み込んだバイト列のまま（ADR-0004）
      expect(read.base.bytes).toEqual(new Uint8Array(readFileSync(join(dir, `screen.${ext}`))));
    },
  );

  it("extract した JSON を編集して render すると、注釈が反映されリビジョンが進む", async () => {
    const dir = workdir();
    const file = await create(join(dir, "screen.png"), { now: NOW });
    extract(file, { doc: join(dir, "doc.json"), base: join(dir, "base.png") });
    const doc = JSON.parse(readFileSync(join(dir, "doc.json"), "utf8"));
    doc.annotations.push({ id: "r1", type: "rect", x: 4, y: 4, w: 20, h: 10 });
    writeFileSync(join(dir, "doc.json"), JSON.stringify(doc));

    await render(file, { doc: join(dir, "doc.json"), now: NOW });
    const read = readFile(file);
    expect(read.kind === "harie" && read.doc.annotations.map((a) => a.id)).toEqual(["r1"]);
    expect(read.kind === "harie" && read.doc.revision).toBe(doc.revision + 1);
    expect(inspect(file)).toContain("注釈: 1 個（rect×1）");
  });

  it("不正な JSON・別ドキュメントの JSON は受け付けない", async () => {
    const dir = workdir();
    const file = await create(join(dir, "screen.png"), { now: NOW });
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ schemaVersion: "0.1", annotations: 1 }));
    await expect(render(file, { doc: join(dir, "bad.json") })).rejects.toThrow(CliError);
    extract(file, { doc: join(dir, "doc.json") });
    const other = { ...JSON.parse(readFileSync(join(dir, "doc.json"), "utf8")) };
    other.docId = "00000000-0000-4000-8000-000000000000";
    writeFileSync(join(dir, "other.json"), JSON.stringify(other));
    await expect(render(file, { doc: join(dir, "other.json") })).rejects.toThrow("docId");
  });

  it("ADR-0007: mask はベース画像を書き換え、加工の記録だけを残す", async () => {
    const dir = workdir();
    const file = await create(join(dir, "screen.png"), { now: NOW });
    const before = readFile(file);
    await mask(file, { rect: "8,8,30,16", method: "fill", kind: "email", now: NOW });
    const after = readFile(file);
    expect(after.kind).toBe("harie");
    if (after.kind !== "harie" || before.kind !== "harie") return;
    expect(after.base.bytes).not.toEqual(before.base.bytes);
    expect(after.doc.pii.applied).toEqual([
      { kind: "email", method: "fill", rect: { x: 8, y: 8, w: 30, h: 16 } },
    ]);
    await expect(mask(file, { rect: "1,2", method: "fill", kind: "email" })).rejects.toThrow(
      "x,y,w,h",
    );
    await expect(mask(file, { rect: "1,2,3,4", method: "erase", kind: "email" })).rejects.toThrow(
      CliError,
    );
    await expect(
      mask(file, { rect: "900,900,3,4", method: "fill", kind: "email" }),
    ).rejects.toThrow("画像の外");
  });

  it("inspect は普通の画像・壊れたファイルでも落ちずに状態を表示する", () => {
    const dir = workdir();
    expect(inspect(join(dir, "screen.png"))).toContain("普通の画像");
    writeFileSync(join(dir, "broken.jpg"), Uint8Array.of(0xff, 0xd8, 0xff, 0x00));
    expect(inspect(join(dir, "broken.jpg"))).toContain("壊れている");
    expect(JSON.parse(inspect(join(dir, "screen.png"), { json: true }))).toEqual({
      kind: "plain",
      format: "png",
    });
  });

  it("注釈データのない画像の render・extract は分かるエラーにする", async () => {
    const dir = workdir();
    await expect(render(join(dir, "screen.png"))).rejects.toThrow("harie create");
    expect(() => extract(join(dir, "screen.png"), { doc: join(dir, "d.json") })).toThrow(CliError);
  });
});
