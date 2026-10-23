import { createDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { AiError, type ImageInput } from "./llm";
import { createOpenRouterClient, jsonSchemaFor, OPENROUTER_DEFAULT_MODEL } from "./openrouter";
import { PiiOutputSchema } from "./pii";
import { SuggestOutputSchema, suggestAnnotations } from "./suggest";

const doc = createDocument({
  width: 1600,
  height: 1000,
  docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
  now: new Date("2026-10-23T00:00:00Z"),
});
const image: ImageInput = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  mediaType: "image/jpeg",
  width: 800,
  height: 500,
};

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

function fakeFetch(status: number, body: unknown) {
  const captured: Captured[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { fetch, captured };
}

const completion = (
  content: string | null,
  finishReason = "stop",
  refusal: string | null = null,
) => ({
  id: "gen-test",
  choices: [{ finish_reason: finishReason, message: { role: "assistant", content, refusal } }],
});

describe("OpenRouter クライアント（ADR-0012）", () => {
  it("FR-AI-05: 画像を data URL で、出力の形を JSON スキーマで送り、応答を検証して返す", async () => {
    const { fetch, captured } = fakeFetch(200, completion('{"suggestions":[]}'));
    const client = createOpenRouterClient({
      apiKey: "sk-or-test",
      appUrl: "https://harie.studio",
      fetch,
    });
    expect(await suggestAnnotations({ client, image, doc, intent: "設定" })).toEqual([]);
    const req = captured[0];
    if (req === undefined) throw new Error("リクエストが送られていない");
    expect(req.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(req.headers.get("authorization")).toBe("Bearer sk-or-test");
    expect(req.headers.get("http-referer")).toBe("https://harie.studio");
    expect(req.body).toMatchObject({
      model: OPENROUTER_DEFAULT_MODEL,
      response_format: { type: "json_schema", json_schema: { strict: true } },
    });
    const user = (req.body.messages as { role: string; content: unknown }[])[1];
    expect(user?.content).toMatchObject([
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/2Q==" } },
      { type: "text" },
    ]);
  });

  it("失敗は理由付きのエラーにし、キーを含めない", async () => {
    const cases: [number, unknown, AiError["kind"]][] = [
      [401, { error: { message: "No auth credentials found" } }, "auth"],
      [402, { error: { message: "Insufficient credits" } }, "credits"],
      [429, { error: { message: "Rate limited" } }, "rate-limit"],
      [500, { error: { message: "oops" } }, "other"],
      [200, completion(null, "content_filter"), "refusal"],
      [200, completion("", "stop", "I can't help with that"), "refusal"],
      [200, completion('{"suggestions":', "length"), "invalid-output"],
      [200, completion('{"suggestions":[{"text":1}]}'), "invalid-output"],
      [200, { unexpected: true }, "invalid-output"],
    ];
    for (const [status, body, kind] of cases) {
      const client = createOpenRouterClient({
        apiKey: "sk-or-secret",
        fetch: fakeFetch(status, body).fetch,
      });
      const error = await suggestAnnotations({ client, image, doc, intent: "" }).catch((e) => e);
      expect(error).toBeInstanceOf(AiError);
      expect(error.kind).toBe(kind);
      expect(String(error.message)).not.toContain("sk-or-secret");
    }
  });

  it("つながらないときは network のエラーにする", async () => {
    const fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof globalThis.fetch;
    const client = createOpenRouterClient({ apiKey: "sk-or-test", fetch });
    await expect(suggestAnnotations({ client, image, doc, intent: "" })).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("JSON スキーマから数値の範囲と $schema を外し、項目名は残す", () => {
    const suggest = JSON.stringify(jsonSchemaFor(SuggestOutputSchema));
    expect(suggest).not.toContain("$schema");
    expect(suggest).not.toContain("minimum");
    expect(suggest).toContain('"elementIndex"');
    expect(jsonSchemaFor(PiiOutputSchema)).toMatchObject({
      type: "object",
      required: ["findings"],
      additionalProperties: false,
    });
  });
});
