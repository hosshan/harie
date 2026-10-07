import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAnoi } from "@anoi/format";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { createServer } from "./server";

const FIXTURES = new URL("../../../packages/format/fixtures/", import.meta.url);

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "anoi-mcp-"));
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

describe("anoi MCP server", () => {
  it("FR-MCP-01: 5 つのツールを公開する", async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "anoi_create",
      "anoi_edit",
      "anoi_list",
      "anoi_open",
      "anoi_preview",
    ]);
    const edit = tools.find((t) => t.name === "anoi_edit");
    expect(edit?.inputSchema.required).toEqual(["path", "ops"]);
  });

  it("FR-MCP-04 → 02 → 03: 画像から作り、開き、注釈を付けて保存する", async () => {
    const { root, call } = await setup();
    const opened0 = await call("anoi_open", { path: "screen.png" });
    expect(opened0.json().status).toBe("plain");

    const created = await call("anoi_create", { imagePath: "screen.png", title: "通知設定" });
    expect(created.isError).toBe(false);
    expect(created.json()).toMatchObject({ path: "screen.anoi.png", revision: 1 });

    const opened = await call("anoi_open", { path: "screen.anoi.png" });
    expect(opened.json()).toMatchObject({
      status: "ok",
      title: "通知設定",
      canvas: { width: 64, height: 40 },
      annotations: [],
    });
    expect(opened.image?.mimeType).toBe("image/png");

    const edited = await call("anoi_edit", {
      path: "screen.anoi.png",
      ops: [{ op: "add", annotation: rect }],
      expectedRevision: 1,
    });
    expect(edited.isError).toBe(false);
    expect(edited.json()).toMatchObject({ revision: 2, annotations: [rect] });
    expect(edited.image?.mimeType).toBe("image/png");

    const read = readAnoi(new Uint8Array(readFileSync(join(root, "screen.anoi.png"))));
    expect(read.kind).toBe("anoi");
    expect(read.kind === "anoi" && read.doc.annotations).toEqual([rect]);
    // ベース画像は読み込んだバイト列のまま（ADR-0004）
    expect(read.kind === "anoi" && read.base.bytes).toEqual(
      new Uint8Array(readFileSync(join(root, "screen.png"))),
    );
  });

  it("FR-MCP-03: preview はファイルを変えずに画像を返す", async () => {
    const { root, call } = await setup();
    await call("anoi_create", { imagePath: "screen.jpg" });
    const before = readFileSync(join(root, "screen.anoi.jpg"));
    const p = await call("anoi_preview", {
      path: "screen.anoi.jpg",
      ops: [{ op: "add", annotation: rect }],
    });
    expect(p.json()).toMatchObject({ saved: false, annotations: [rect] });
    expect(p.image?.mimeType).toBe("image/jpeg");
    expect(readFileSync(join(root, "screen.anoi.jpg"))).toEqual(before);
  });

  it("楽観的ロック: expectedRevision が古ければ保存しない", async () => {
    const { call } = await setup();
    await call("anoi_create", { imagePath: "screen.png" });
    await call("anoi_edit", { path: "screen.anoi.png", ops: [{ op: "add", annotation: rect }] });
    const stale = await call("anoi_edit", {
      path: "screen.anoi.png",
      ops: [{ op: "remove", id: "r1" }],
      expectedRevision: 1,
    });
    expect(stale.isError).toBe(true);
    expect(stale.text).toContain("現在 2");
    expect((await call("anoi_open", { path: "screen.anoi.png" })).json().annotations).toEqual([
      rect,
    ]);
  });

  it("不正な操作はファイルを変えずにエラーを返す", async () => {
    const { call } = await setup();
    await call("anoi_create", { imagePath: "screen.png" });
    const dup = await call("anoi_edit", {
      path: "screen.anoi.png",
      ops: [
        { op: "add", annotation: rect },
        { op: "add", annotation: rect },
      ],
    });
    expect(dup.isError).toBe(true);
    expect(dup.text).toContain("ops[1]");
    const bad = await call("anoi_edit", {
      path: "screen.anoi.png",
      ops: [{ op: "add", annotation: { id: "x", type: "star" } }],
    });
    expect(bad.isError).toBe(true);
    expect((await call("anoi_open", { path: "screen.anoi.png" })).json().revision).toBe(1);
  });

  it("許可されたディレクトリの外（.. ・絶対パス・シンボリックリンク）は扱えない", async () => {
    const { root, call } = await setup();
    const outside = mkdtempSync(join(tmpdir(), "anoi-outside-"));
    writeFileSync(join(outside, "secret.png"), readFileSync(new URL("base.png", FIXTURES)));
    symlinkSync(outside, join(root, "link"));
    for (const path of ["../x.png", join(outside, "secret.png"), "link/secret.png"]) {
      const r = await call("anoi_open", { path });
      expect(r.isError, path).toBe(true);
      expect(r.text).toContain("許可されたディレクトリ");
    }
    const r = await call("anoi_create", { imagePath: "screen.png", outPath: "../out.anoi.png" });
    expect(r.isError).toBe(true);
  });

  it("create は既存ファイルを上書きせず、拡張子の不一致も拒否する", async () => {
    const { call } = await setup();
    await call("anoi_create", { imagePath: "screen.png" });
    expect((await call("anoi_create", { imagePath: "screen.png" })).isError).toBe(true);
    expect(
      (await call("anoi_create", { imagePath: "screen.png", outPath: "x.anoi.jpg" })).isError,
    ).toBe(true);
  });

  it("anoi_list は Anoi ファイルだけを一覧する", async () => {
    const { root, call } = await setup();
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "a.png"), readFileSync(new URL("base.png", FIXTURES)));
    await call("anoi_create", { imagePath: "screen.png", title: "一覧" });
    await call("anoi_create", { imagePath: "sub/a.png" });
    const all = (await call("anoi_list", {})).json();
    expect(all.files.map((f: { path: string }) => f.path).sort()).toEqual([
      "screen.anoi.png",
      join("sub", "a.anoi.png"),
    ]);
    expect(all.files.find((f: { path: string }) => f.path === "screen.anoi.png")).toMatchObject({
      title: "一覧",
      revision: 1,
      annotations: 0,
    });
    expect((await call("anoi_list", { recursive: false })).json().files).toHaveLength(1);
  });
});
