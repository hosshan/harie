// OpenRouter による LlmClient（ADR-0012）。利用者が OAuth（PKCE）で発行したキーで、利用者の端末から直接呼ぶ。
// OpenAI 互換の Chat Completions を fetch で呼ぶ（SDK は足さない）。キーはログ・エラー文に含めない（NFR-SEC-04）
import { toBase64 } from "@harie/render";
import { z } from "zod";
import { AiError, type LlmClient, type LlmRequest } from "./llm";

export const OPENROUTER_API = "https://openrouter.ai/api/v1";

/** 既定のモデル。OpenRouter の「最新の Claude Opus」の別名で、新しい版が出ると自動で切り替わる */
export const OPENROUTER_DEFAULT_MODEL = "~anthropic/claude-opus-latest";

export type OpenRouterClientOptions = {
  apiKey: string;
  model?: string;
  /** OpenRouter に伝えるアプリの URL（HTTP-Referer）。利用状況の画面でアプリ名を出すために使われる */
  appUrl?: string;
  /** テスト用 */
  fetch?: typeof fetch;
};

/** 応答のうち使う部分。外部入力なので、形を確かめてから使う */
const ResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

export function createOpenRouterClient(options: OpenRouterClientOptions): LlmClient {
  const model = options.model ?? OPENROUTER_DEFAULT_MODEL;
  const doFetch = options.fetch ?? fetch;

  return {
    model,
    async generate<T>(request: LlmRequest<T>): Promise<T> {
      const body = {
        model,
        max_tokens: 16000,
        // 画像から位置を読み取る作業なので、考える深さは中程度で足りる（Claude API で呼ぶときと同じ）
        reasoning: { effort: "medium" },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "harie_output",
            strict: true,
            schema: jsonSchemaFor(request.schema),
          },
        },
        messages: [
          { role: "system", content: request.system },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${request.image.mediaType};base64,${toBase64(request.image.bytes)}`,
                },
              },
              { type: "text", text: request.prompt },
            ],
          },
        ],
      };
      let response: Response;
      try {
        response = await doFetch(`${OPENROUTER_API}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            "x-title": "Harie",
            ...(options.appUrl === undefined ? {} : { "http-referer": options.appUrl }),
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw new AiError("OpenRouter に接続できませんでした", "network");
      }
      if (!response.ok) throw statusError(response.status);

      let parsedResponse: z.infer<typeof ResponseSchema>;
      try {
        parsedResponse = ResponseSchema.parse(await response.json());
      } catch {
        throw new AiError("AI の応答を読み取れませんでした", "invalid-output");
      }
      const choice = parsedResponse.choices[0];
      const refusal = choice?.message.refusal;
      if (
        choice?.finish_reason === "content_filter" ||
        (refusal !== undefined && refusal !== null && refusal !== "")
      ) {
        throw new AiError("この画像は AI で処理できませんでした", "refusal");
      }
      const text = choice?.message.content;
      if (choice?.finish_reason === "length" || text === undefined || text === null) {
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

function statusError(status: number): AiError {
  if (status === 401 || status === 403) {
    return new AiError("OpenRouter のキーが正しくないか、使える権限がありません", "auth");
  }
  // 402: クレジットが足りない
  if (status === 402) return new AiError("OpenRouter のクレジットが足りません", "credits");
  if (status === 429) {
    return new AiError("利用の上限に達しました。しばらくしてから試してください", "rate-limit");
  }
  return new AiError(`OpenRouter がエラーを返しました（${status}）`, "other");
}

/**
 * zod のスキーマを、構造化出力に渡す JSON スキーマにする。
 * 受け付けるキーワードはモデルの提供元ごとに違うので、検証に使わない数値の範囲などは外す（範囲は受け取った後で zod が確かめる）
 */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return strip(rest) as Record<string, unknown>;
}

const UNSUPPORTED = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]);

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !UNSUPPORTED.has(k))
      .map(([k, v]) => [k, k === "properties" ? stripProperties(v) : strip(v)]),
  );
}

/** properties の中のキーは項目名なので外さず、値（各項目のスキーマ）だけを整える */
function stripProperties(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, strip(v)]));
}
