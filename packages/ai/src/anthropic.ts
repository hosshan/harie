// Claude API による LlmClient（architecture 4 章）。MVP は BYOK: 利用者の API キーで、利用者の端末から直接呼ぶ。
// キーはこのモジュールの外に出さない（ログ・エラー文にも含めない。NFR-SEC-04）
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { toBase64 } from "@harie/render";
import { AiError, type LlmClient, type LlmRequest } from "./llm";

export const DEFAULT_MODEL = "claude-opus-5-5";

export type AnthropicClientOptions = {
  apiKey: string;
  model?: string;
  /** ブラウザから直接呼ぶ（BYOK）。キーは利用者自身のものなので、ブラウザでの利用を許可する */
  browser?: boolean;
  /** テスト用 */
  fetch?: typeof fetch;
};

export function createAnthropicClient(options: AnthropicClientOptions): LlmClient {
  const client = new Anthropic({
    apiKey: options.apiKey,
    dangerouslyAllowBrowser: options.browser === true,
    maxRetries: 2,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const model = options.model ?? DEFAULT_MODEL;

  return {
    model,
    async generate<T>(request: LlmRequest<T>): Promise<T> {
      let response: Awaited<ReturnType<typeof client.beta.messages.create>>;
      try {
        // parse() は stop_reason を見る前に本文を解析して失敗するため、create() で受けて自分で解析する
        response = await client.beta.messages.create({
          model,
          max_tokens: 16000,
          // 画像から位置を読み取る作業なので、考える深さは中程度で足りる
          output_config: { effort: "medium", format: betaZodOutputFormat(request.schema) },
          // 安全側の判定で断られたときは、サーバー側で別のモデルに引き継ぐ
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: request.system,
          messages: [
            {
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
          ],
          stream: false,
        });
      } catch (e) {
        throw toAiError(e);
      }
      if (response.stop_reason === "refusal") {
        throw new AiError("この画像は AI で処理できませんでした", "refusal");
      }
      const text = response.content.find((b) => b.type === "text")?.text;
      if (response.stop_reason === "max_tokens" || text === undefined) {
        throw new AiError("AI の応答を読み取れませんでした", "invalid-output");
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AiError("AI の応答を読み取れませんでした", "invalid-output");
      }
      // 外部入力なので、スキーマで検証してから使う（CLAUDE.md）
      const parsed = request.schema.safeParse(json);
      if (!parsed.success) throw new AiError("AI の応答の形式が違います", "invalid-output");
      return parsed.data;
    },
  };
}

function toAiError(e: unknown): AiError {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiError("API キーが正しくないか、使える権限がありません", "auth");
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new AiError("利用の上限に達しました。しばらくしてから試してください", "rate-limit");
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new AiError("Claude API に接続できませんでした", "network");
  }
  if (e instanceof Anthropic.APIError) {
    return new AiError(`Claude API がエラーを返しました（${e.status ?? "不明"}）`, "other");
  }
  return new AiError("AI の呼び出しに失敗しました", "other");
}
