// MCP サーバーの組み立て。ツールの入力は zod で検証してから本体に渡す（CLAUDE.md）

import { OpSchema, PiiMaskSchema } from "@harie/model";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };
import { guidePrompt, SERVER_INSTRUCTIONS } from "./guide";
import { createRootGuard, PathError } from "./paths";
import { create, edit, list, mask, open, preview, ToolError, type ToolOutput } from "./tools";

const OPS_HELP = `ops は操作の配列。座標はベース画像のピクセル（canvas.width × canvas.height）で、左上が原点。
例: [{"op":"add","annotation":{"id":"r1","type":"rect","x":40,"y":40,"w":200,"h":80}},
     {"op":"add","annotation":{"id":"c1","type":"callout","x":260,"y":60,"w":240,"text":"ここで通知を設定します"}},
     {"op":"update","id":"r1","patch":{"w":220}}, {"op":"remove","id":"c1"}]
注釈の type: rect / ellipse / arrow(from,to) / text(x,y,text) / callout(x,y,w,text) / badge(x,y,number) / spotlight / blur(method: blur|mosaic)。
style（任意）: stroke, strokeWidth, fill, color, fontSize, fontWeight, radius, opacity, head, dash（solid / dashed / dotted。四角・楕円・矢印の線の種類）。
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
  const server = new McpServer(
    { name: "harie", version: pkg.version },
    { instructions: SERVER_INSTRUCTIONS },
  );
  const path = z.string().describe(`ファイルのパス（${guard.root} からの相対パスか絶対パス）`);
  const ops = z.array(OpSchema).describe(OPS_HELP);
  // harie_preview の ops は harie_edit と同じ。定義の重複でツール一覧が大きくならないよう形だけ示し、
  // 中身は applyOps が OpSchema で検証する
  const sameOps = z
    .array(z.looseObject({ op: z.enum(OpSchema.options.map((o) => o.shape.op.value)) }))
    .describe("harie_edit の ops と同じ形式");

  server.registerTool(
    "harie_open",
    {
      title: "Harie ファイルを開く",
      description:
        "Harie ファイル（注釈を再編集できる JPEG/PNG）を開き、注釈の一覧と画像を返す。普通の画像なら status: plain を返す",
      inputSchema: { path },
      annotations: { readOnlyHint: true },
    },
    async (input) => run(() => open(guard, input)),
  );

  server.registerTool(
    "harie_create",
    {
      title: "画像から Harie ファイルを作る",
      description:
        "普通の JPEG/PNG から注釈のない Harie ファイルを作る。元の画像はそのまま残し、既定では <名前>.harie.<拡張子> に保存する。以後の保存もこの形式になる",
      inputSchema: {
        imagePath: path,
        outPath: z.string().optional().describe("保存先。省略時は <名前>.harie.<拡張子>"),
        format: z
          .enum(["jpeg", "png"])
          .optional()
          .describe(
            "保存形式。省略時は outPath の拡張子、なければ元画像と同じ。文字の多い画面は png",
          ),
        title: z.string().optional().describe("画像のタイトル（例: 通知設定の画面）"),
      },
    },
    async (input) => run(() => create(guard, input)),
  );

  server.registerTool(
    "harie_edit",
    {
      title: "注釈を変更して保存する",
      description:
        "注釈を追加・更新・削除し、画像を描き直して上書き保存する。保存後の画像を返す。先に harie_preview で確認するとよい",
      inputSchema: {
        path,
        ops,
        expectedRevision: z
          .int()
          .nonnegative()
          .optional()
          .describe("harie_open で得た revision。他で先に保存されていたら失敗させる"),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async (input) => run(() => edit(guard, input)),
  );

  server.registerTool(
    "harie_preview",
    {
      title: "注釈の変更を保存せずに確認する",
      description: "ops を適用した結果の画像を返す。ファイルは変更しない",
      inputSchema: { path, ops: sameOps },
      annotations: { readOnlyHint: true },
    },
    async (input) => run(() => preview(guard, input)),
  );

  server.registerTool(
    "harie_mask",
    {
      title: "個人情報をマスクする（元に戻せない）",
      description: `画像内の個人情報（氏名・メール・電話番号など）を、ベース画像を書き換えて隠す。保存すると元に戻せず、ファイルのどこにも元の情報は残らない。
まず confirm を付けずに呼ぶと、保存せずに加工後の画像を返す。範囲と方法を確かめてから、同じ masks に confirm: true を付けて保存する。
method: replace（ダミー文字列に置き換える。replacement に同じ種類のダミー値を渡す。例: 山田 花子 / hanako@example.com）/ fill（塗りつぶし）/ mosaic / blur。文字は replace か fill を使う。
rect はベース画像のピクセル（左上原点）で、文字より少し広めに取る。注釈の blur とは別物で、個人情報にはこちらを使う。`,
      inputSchema: {
        path,
        masks: z.array(PiiMaskSchema).min(1).describe("隠す範囲と方法"),
        confirm: z
          .boolean()
          .optional()
          .describe("true で保存する（元に戻せない）。省略時は保存せずに結果だけ返す"),
        outPath: z
          .string()
          .optional()
          .describe("別のファイルとして保存する場合の保存先。省略時は上書き"),
        expectedRevision: z
          .int()
          .nonnegative()
          .optional()
          .describe("harie_open で得た revision。他で先に保存されていたら失敗させる"),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async (input) => run(() => mask(guard, input)),
  );

  server.registerTool(
    "harie_list",
    {
      title: "Harie ファイルを一覧する",
      description:
        "ディレクトリ内の Harie ファイルを、タイトル・リビジョン・注釈数とともに一覧する",
      inputSchema: {
        dir: z.string().optional().describe("探すディレクトリ。省略時は許可されたディレクトリ全体"),
        recursive: z.boolean().optional().describe("サブディレクトリも探すか（既定 true）"),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => run(() => list(guard, input)),
  );

  server.registerPrompt(
    "harie_guide",
    {
      title: "ガイド用の注釈を付ける",
      description:
        "スクリーンショットのどこを強調し、どんな説明を添えるかの手引きと、Harie のツールでの手順を返す",
      argsSchema: {
        path: z.string().describe("注釈を付ける画像のパス（--root からの相対パスか絶対パス）"),
        intent: z
          .string()
          .optional()
          .describe("何を説明したいか（例: 通知設定の変え方）。省略時は画面の主な操作"),
      },
    },
    (args) => ({
      messages: [{ role: "user", content: { type: "text", text: guidePrompt(args) } }],
    }),
  );

  return server;
}
