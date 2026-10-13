import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHarie } from "@harie/format";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { createServer } from "./server";

const FIXTURES = new URL("../../../packages/format/fixtures/", import.meta.url);

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "harie-mcp-"));
  writeFileSync(join(root, "screen.png"), readFileSync(new URL("base.png", FIXTURES)));
  writeFileSync(join(root, "screen.jpg"), readFileSync(new URL("base.jpg", FIXTURES)));
  const server = createServer({ root });
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const text = r.content.find((c) => c.type === "text");
    const image = r.content.find((c) => c.type === "image");
    return {
      isError: r.isError === true,
      text: text?.type === "text" ? text.text : "",
      json: () => JSON.parse(text?.type === "text" ? text.text : "null"),
      image: image?.type === "image" ? image : undefined,
    };
  };
  return { root, client, call };
}

const rect = { id: "r1", type: "rect", x: 4, y: 4, w: 30, h: 16 };

describe("harie MCP server", () => {
  it("FR-MCP-01: 6 つのツールを公開する", async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "harie_create",
      "harie_edit",
      "harie_list",
      "harie_mask",
      "harie_open",
      "harie_preview",
    ]);
    const edit = tools.find((t) => t.name === "harie_edit");
    expect(edit?.inputSchema.required).toEqual(["path", "ops"]);
  });

  it("FR-MCP-01: ツール定義は共通の定義を $ref で共有し、小さく保つ", async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    const edit = JSON.stringify(tools.find((t) => t.name === "harie_edit")?.inputSchema);
    // style は注釈の種類ごとに繰り返さず、1 か所の定義を参照する
    expect(edit.match(/"strokeWidth"/g)).toHaveLength(1);
    expect(JSON.stringify(tools).length).toBeLessThan(12_000);
  });

  it("FR-MCP-04 → 02 → 03: 画像から作り、開き、注釈を付けて保存する", async () => {
    const { root, call } = await setup();
    const opened0 = await call("harie_open", { path: "screen.png" });
    expect(opened0.json().status).toBe("plain");

    const created = await call("harie_create", { imagePath: "screen.png", title: "通知設定" });
    expect(created.isError).toBe(false);
    expect(created.json()).toMatchObject({ path: "screen.harie.png", revision: 1 });

    const opened = await call("harie_open", { path: "screen.harie.png" });
    expect(opened.json()).toMatchObject({
      status: "ok",
      title: "通知設定",
      canvas: { width: 64, height: 40 },
      annotations: [],
    });
    expect(opened.image?.mimeType).toBe("image/png");

    const edited = await call("harie_edit", {
      path: "screen.harie.png",
      ops: [{ op: "add", annotation: rect }],
      expectedRevision: 1,
    });
    expect(edited.isError).toBe(false);
    expect(edited.json()).toMatchObject({ revision: 2, annotations: [rect] });
    expect(edited.image?.mimeType).toBe("image/png");

    const read = readHarie(new Uint8Array(readFileSync(join(root, "screen.harie.png"))));
    expect(read.kind).toBe("harie");
    expect(read.kind === "harie" && read.doc.annotations).toEqual([rect]);
    // ベース画像は読み込んだバイト列のまま（ADR-0004）
    expect(read.kind === "harie" && read.base.bytes).toEqual(
      new Uint8Array(readFileSync(join(root, "screen.png"))),
    );
  });

  it("FR-FILE-01, 02: format で保存形式を選べ、ベース画像はそのまま埋め込み、以後もその形式で保存する", async () => {
    const { root, call } = await setup();
    const created = await call("harie_create", { imagePath: "screen.jpg", format: "png" });
    expect(created.json()).toMatchObject({ path: "screen.harie.png" });
    const edited = await call("harie_edit", {
      path: "screen.harie.png",
      ops: [{ op: "add", annotation: rect }],
    });
    expect(edited.image?.mimeType).toBe("image/png");
    const read = readHarie(new Uint8Array(readFileSync(join(root, "screen.harie.png"))));
    expect(read).toMatchObject({ kind: "harie", format: "png", base: { mediaType: "image/jpeg" } });
    if (read.kind !== "harie") throw new Error(read.kind);
    expect(read.base.bytes).toEqual(new Uint8Array(readFileSync(join(root, "screen.jpg"))));

    // format がなければ outPath の拡張子に従う。食い違えば保存しない
    const byExt = await call("harie_create", { imagePath: "screen.png", outPath: "out.jpg" });
    expect(readHarie(new Uint8Array(readFileSync(join(root, "out.jpg"))))).toMatchObject({
      kind: "harie",
      format: "jpeg",
    });
    expect(byExt.isError).toBe(false);
    const conflict = await call("harie_create", {
      imagePath: "screen.png",
      outPath: "x.png",
      format: "jpeg",
    });
    expect(conflict.isError).toBe(true);
    expect(conflict.text).toContain(".jpg");
  });

  it("FR-MCP-03: preview はファイルを変えずに画像を返す", async () => {
    const { root, call } = await setup();
    await call("harie_create", { imagePath: "screen.jpg" });
    const before = readFileSync(join(root, "screen.harie.jpg"));
    const p = await call("harie_preview", {
      path: "screen.harie.jpg",
      ops: [{ op: "add", annotation: rect }],
    });
    expect(p.json()).toMatchObject({ saved: false, annotations: [rect] });
    expect(p.image?.mimeType).toBe("image/jpeg");
    expect(readFileSync(join(root, "screen.harie.jpg"))).toEqual(before);
    // ツール定義では形だけ示し、中身は harie_edit と同じく検証する
    const bad = await call("harie_preview", {
      path: "screen.harie.jpg",
      ops: [{ op: "add", annotation: { ...rect, w: -1 } }],
    });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain("ops[0]");
  });

  it("楽観的ロック: expectedRevision が古ければ保存しない", async () => {
    const { call } = await setup();
    await call("harie_create", { imagePath: "screen.png" });
    await call("harie_edit", { path: "screen.harie.png", ops: [{ op: "add", annotation: rect }] });
    const stale = await call("harie_edit", {
      path: "screen.harie.png",
      ops: [{ op: "remove", id: "r1" }],
      expectedRevision: 1,
    });
    expect(stale.isError).toBe(true);
    expect(stale.text).toContain("現在 2");
    expect((await call("harie_open", { path: "screen.harie.png" })).json().annotations).toEqual([
      rect,
    ]);
  });

  it("不正な操作はファイルを変えずにエラーを返す", async () => {
    const { call } = await setup();
    await call("harie_create", { imagePath: "screen.png" });
    const dup = await call("harie_edit", {
      path: "screen.harie.png",
      ops: [
        { op: "add", annotation: rect },
        { op: "add", annotation: rect },
      ],
    });
    expect(dup.isError).toBe(true);
    expect(dup.text).toContain("ops[1]");
    const bad = await call("harie_edit", {
      path: "screen.harie.png",
      ops: [{ op: "add", annotation: { id: "x", type: "star" } }],
    });
    expect(bad.isError).toBe(true);
    expect((await call("harie_open", { path: "screen.harie.png" })).json().revision).toBe(1);
  });

  it("許可されたディレクトリの外（.. ・絶対パス・シンボリックリンク）は扱えない", async () => {
    const { root, call } = await setup();
    const outside = mkdtempSync(join(tmpdir(), "harie-outside-"));
    writeFileSync(join(outside, "secret.png"), readFileSync(new URL("base.png", FIXTURES)));
    symlinkSync(outside, join(root, "link"));
    for (const path of ["../x.png", join(outside, "secret.png"), "link/secret.png"]) {
      const r = await call("harie_open", { path });
      expect(r.isError, path).toBe(true);
      expect(r.text).toContain("許可されたディレクトリ");
    }
    const r = await call("harie_create", { imagePath: "screen.png", outPath: "../out.harie.png" });
    expect(r.isError).toBe(true);
  });

  it("create は既存ファイルを上書きせず、JPEG / PNG 以外の拡張子も拒否する", async () => {
    const { call } = await setup();
    await call("harie_create", { imagePath: "screen.png" });
    expect((await call("harie_create", { imagePath: "screen.png" })).isError).toBe(true);
    expect(
      (await call("harie_create", { imagePath: "screen.png", outPath: "x.harie.webp" })).isError,
    ).toBe(true);
  });

  it("FR-MCP-01: サーバーのバージョンは package.json の version と同じ", async () => {
    const { client } = await setup();
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(client.getServerVersion()?.version).toBe(pkg.version);
  });

  it("FR-PII-02〜04: harie_mask は confirm がなければ保存せず、confirm: true でベース画像を書き換える", async () => {
    const { root, call } = await setup();
    await call("harie_create", { imagePath: "screen.png" });
    await call("harie_edit", { path: "screen.harie.png", ops: [{ op: "add", annotation: rect }] });
    const file = join(root, "screen.harie.png");
    const before = readFileSync(file);
    const masks = [{ kind: "email", method: "fill", rect: { x: 0, y: 0, w: 32, h: 20 } }];

    const dry = await call("harie_mask", { path: "screen.harie.png", masks });
    expect(dry.isError).toBe(false);
    expect(dry.json()).toMatchObject({ saved: false, applied: masks });
    expect(dry.image?.mimeType).toBe("image/png");
    expect(readFileSync(file)).toEqual(before);

    const done = await call("harie_mask", {
      path: "screen.harie.png",
      masks,
      confirm: true,
      expectedRevision: 2,
    });
    expect(done.json()).toMatchObject({ saved: true, revision: 3, annotations: [rect] });
    const read = readHarie(new Uint8Array(readFileSync(file)));
    expect(read.kind === "harie" && read.doc.pii.applied).toEqual(masks);
    expect(read.kind === "harie" && read.base.bytes).not.toEqual(
      new Uint8Array(readFileSync(join(root, "screen.png"))),
    );
  });

  it("harie_mask は画像の外の範囲・古い revision・既存の outPath を拒否する", async () => {
    const { call } = await setup();
    await call("harie_create", { imagePath: "screen.png" });
    const masks = [{ kind: "name", method: "fill", rect: { x: 100, y: 100, w: 10, h: 10 } }];
    expect((await call("harie_mask", { path: "screen.harie.png", masks })).text).toContain(
      "画像（64×40）の外",
    );
    const inside = [{ kind: "name", method: "fill", rect: { x: 0, y: 0, w: 10, h: 10 } }];
    const stale = { path: "screen.harie.png", masks: inside, confirm: true, expectedRevision: 9 };
    expect((await call("harie_mask", stale)).isError).toBe(true);
    const exists = {
      path: "screen.harie.png",
      masks: inside,
      confirm: true,
      outPath: "screen.png",
    };
    expect((await call("harie_mask", exists)).isError).toBe(true);
    const copy = {
      path: "screen.harie.png",
      masks: inside,
      confirm: true,
      outPath: "masked.harie.png",
    };
    expect((await call("harie_mask", copy)).json()).toMatchObject({ path: "masked.harie.png" });
  });

  it("harie_list は Harie ファイルだけを一覧する", async () => {
    const { root, call } = await setup();
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "a.png"), readFileSync(new URL("base.png", FIXTURES)));
    await call("harie_create", { imagePath: "screen.png", title: "一覧" });
    await call("harie_create", { imagePath: "sub/a.png" });
    const all = (await call("harie_list", {})).json();
    expect(all.files.map((f: { path: string }) => f.path).sort()).toEqual([
      "screen.harie.png",
      join("sub", "a.harie.png"),
    ]);
    expect(all.files.find((f: { path: string }) => f.path === "screen.harie.png")).toMatchObject({
      title: "一覧",
      revision: 1,
      annotations: 0,
    });
    expect((await call("harie_list", { recursive: false })).json().files).toHaveLength(1);
  });
});
