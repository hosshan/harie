// 評価専用の LlmClient。Claude Agent SDK（Claude Code）経由で呼び、CLAUDE_CODE_OAUTH_TOKEN（Claude のプラン）で認証する。
// 製品（Web の BYOK）は src/anthropic.ts を使う。プロンプト・出力の検証・座標の処理は同じものを通るが、呼び出し方が違う
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { toBase64 } from "@harie/render";
import { z } from "zod";
import { DEFAULT_MODEL } from "../src/anthropic";
import { AiError, type LlmClient, type LlmRequest } from "../src/llm";

export function createAgentClient(options: { model?: string } = {}): LlmClient {
  const model = options.model ?? DEFAULT_MODEL;
  return {
    model,
    async generate<T>(request: LlmRequest<T>): Promise<T> {
      // 画像を渡すため、プロンプトは文字列ではなくメッセージ 1 通の列で渡す
      async function* prompt(): AsyncIterable<SDKUserMessage> {
        yield {
          type: "user",
          parent_tool_use_id: null,
          message: {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: request.image.mediaType,
                  data: toBase64(request.image.bytes),
                },
              },
              { type: "text", text: request.prompt },
            ],
          },
        };
      }
      // Claude Code の検証器は $schema の URL を解決できないので外す
      const { $schema: _, ...schema } = z.toJSONSchema(request.schema);
      let output: unknown;
      try {
        for await (const message of query({
          prompt: prompt(),
          options: {
            model,
            systemPrompt: request.system,
            outputFormat: { type: "json_schema", schema },
            // ツールも設定ファイルも使わず、画像を見て答えるだけにする
            tools: [],
            settingSources: [],
            maxTurns: 3,
            persistSession: false,
          },
        })) {
          if (message.type !== "result") continue;
          if (message.subtype !== "success") {
            throw new AiError(
              `Claude Code での呼び出しに失敗しました（${message.subtype}）`,
              "other",
            );
          }
          output = message.structured_output;
        }
      } catch (e) {
        if (e instanceof AiError) throw e;
        // SDK のエラー文は 1 行目だけ使う（2 行目以降は子プロセスの出力で長い）
        const line = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "";
        throw new AiError(
          `Claude Code での呼び出しに失敗しました: ${line.slice(0, 300)}`,
          /401|authenticat/i.test(line) ? "auth" : "other",
        );
      }
      if (output === undefined)
        throw new AiError("AI の応答を読み取れませんでした", "invalid-output");
      // 外部入力なので、スキーマで検証してから使う（CLAUDE.md）
      const parsed = request.schema.safeParse(output);
      if (!parsed.success) throw new AiError("AI の応答の形式が違います", "invalid-output");
      return parsed.data;
    },
  };
}
