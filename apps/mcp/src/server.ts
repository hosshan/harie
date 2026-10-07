// MCP サーバーの組み立て。ツールの入力は zod で検証してから本体に渡す（CLAUDE.md）

import { OpSchema } from "@anoi/model";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createRootGuard, PathError } from "./paths";
import { create, edit, list, open, preview, ToolError, type ToolOutput } from "./tools";

const VERSION = "0.0.0";

const OPS_HELP = `ops は操作の配列。座標はベース画像のピクセル（canvas.width × canvas.height）で、左上が原点。
例: [{"op":"add","annotation":{"id":"r1","type":"rect","x":40,"y":40,"w":200,"h":80}},
     {"op":"add","annotation":{"id":"c1","type":"callout","x":260,"y":60,"w":240,"text":"ここで通知を設定します"}},
     {"op":"update","id":"r1","patch":{"w":220}}, {"op":"remove","id":"c1"}]
注釈の type: rect / ellipse / arrow(from,to) / text(x,y,text) / callout(x,y,w,text) / badge(x,y,number) / spotlight / blur(method: blur|mosaic)。
style（任意）: stroke, strokeWidth, fill, color, fontSize, fontWeight, radius, opacity, head。
blur は可逆なぼかしで、個人情報の加工には使わないこと。`;

function toResult(out: ToolOutput): CallToolResult {
  const content: CallToolResult["content"] = [
    { type: "text", text: JSON.stringify(out.summary, null, 2) },
  ];
  if (out.image !== undefined) {
    content.push({
      type: "image",
      data: Buffer.from(out.image.data).toString("base64"),
      mimeType: out.image.mediaType,
    });
  }
  return { content };
}

async function run(fn: () => ToolOutput | Promise<ToolOutput>): Promise<CallToolResult> {
  try {
    return toResult(await fn());
  } catch (e) {
    if (e instanceof ToolError || e instanceof PathError) {
      return { isError: true, content: [{ type: "text", text: e.message }] };
    }
    throw e;
  }
}

export function createServer(options: { root: string }): McpServer {
  const guard = createRootGuard(options.root);
  const server = new McpServer({ name: "anoi", version: VERSION });
  const path = z.string().describe(`ファイルのパス（${guard.root} からの相対パスか絶対パス）`);
  const ops = z.array(OpSchema).describe(OPS_HELP);

  server.registerTool(
    "anoi_open",
    {
      title: "Anoi ファイルを開く",
      description:
        "Anoi ファイル（注釈を再編集できる JPEG/PNG）を開き、注釈の一覧と画像を返す。普通の画像なら status: plain を返す",
      inputSchema: { path },
      annotations: { readOnlyHint: true },
    },
    async (input) => run(() => open(guard, input)),
  );

  server.registerTool(
    "anoi_create",
    {
      title: "画像から Anoi ファイルを作る",
      description:
        "普通の JPEG/PNG から注釈のない Anoi ファイルを作る。元の画像はそのまま残し、既定では <名前>.anoi.<拡張子> に保存する",
      inputSchema: {
        imagePath: path,
        outPath: z.string().optional().describe("保存先。省略時は <名前>.anoi.<拡張子>"),
        title: z.string().optional().describe("画像のタイトル（例: 通知設定の画面）"),
      },
    },
    async (input) => run(() => create(guard, input)),
  );

  server.registerTool(
    "anoi_edit",
    {
      title: "注釈を変更して保存する",
      description:
        "注釈を追加・更新・削除し、画像を描き直して上書き保存する。保存後の画像を返す。先に anoi_preview で確認するとよい",
      inputSchema: {
        path,
        ops,
        expectedRevision: z
          .int()
          .nonnegative()
          .optional()
          .describe("anoi_open で得た revision。他で先に保存されていたら失敗させる"),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async (input) => run(() => edit(guard, input)),
  );

  server.registerTool(
    "anoi_preview",
    {
      title: "注釈の変更を保存せずに確認する",
      description: "ops を適用した結果の画像を返す。ファイルは変更しない",
      inputSchema: { path, ops },
      annotations: { readOnlyHint: true },
    },
    async (input) => run(() => preview(guard, input)),
  );

  server.registerTool(
    "anoi_list",
    {
      title: "Anoi ファイルを一覧する",
      description: "ディレクトリ内の Anoi ファイルを、タイトル・リビジョン・注釈数とともに一覧する",
      inputSchema: {
        dir: z.string().optional().describe("探すディレクトリ。省略時は許可されたディレクトリ全体"),
        recursive: z.boolean().optional().describe("サブディレクトリも探すか（既定 true）"),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => run(() => list(guard, input)),
  );

  return server;
}
