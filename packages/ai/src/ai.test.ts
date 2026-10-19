import { createDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { createAnthropicClient, DEFAULT_MODEL } from "./anthropic";
import type { DomSnapshot } from "./dom";
import { dummyFor } from "./dummy";
import { AiError, fitWithin, type ImageInput, type LlmClient } from "./llm";
import { detectPiiInDom, mergePiiFindings } from "./pii";
import { buildSuggestPrompt, suggestAnnotations, toSuggestions } from "./suggest";

// 1600x1000 のキャンバスを 800x500 に縮小して LLM に送った想定
const doc = createDocument({
  width: 1600,
  height: 1000,
  docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
  now: new Date("2026-10-08T00:00:00Z"),
});
const image: ImageInput = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  mediaType: "image/jpeg",
  width: 800,
  height: 500,
};

const dom: DomSnapshot = {
  url: "https://app.example.com/settings",
  viewport: { width: 800, height: 500, devicePixelRatio: 2 },
  elements: [
    { rect: { x: 100, y: 200, w: 300, h: 60 }, role: "button", name: "通知を保存" },
    { rect: { x: 1200, y: 40, w: 360, h: 40 }, role: "text", text: "sato.hanako@corp.example" },
    { rect: { x: 1200, y: 100, w: 300, h: 40 }, role: "text", text: "電話 03-1234-5678" },
    { rect: { x: 100, y: 400, w: 300, h: 40 }, role: "textbox", name: "氏名", piiHint: "name" },
  ],
};

function mockClient(output: unknown): LlmClient & { calls: { prompt: string }[] } {
  const calls: { prompt: string }[] = [];
  return {
    model: "mock",
    calls,
    async generate(request) {
      calls.push({ prompt: request.prompt });
      return request.schema.parse(output);
    },
  };
}

describe("画像の縮小", () => {
  it("長辺を上限に収め、元の座標に戻す倍率を返す", () => {
    expect(fitWithin(3136, 1960, 1568)).toEqual({ width: 1568, height: 980, scale: 2 });
    expect(fitWithin(800, 500, 1568)).toEqual({ width: 800, height: 500, scale: 1 });
  });
});

describe("補足の提案（FR-AI-01〜03）", () => {
  const output = {
    suggestions: [
      // 要素番号で指したもの → DOM の矩形に合わせる
      {
        target: { x: 52, y: 98, width: 148, height: 34 },
        elementIndex: 0,
        text: "「通知を保存」をクリックします。",
      },
      // 番号はないが、DOM 要素とよく重なる → その矩形に合わせる
      {
        target: { x: 51, y: 202, width: 149, height: 18 },
        elementIndex: null,
        text: "氏名を入力します。",
      },
      // 画像の外 → 捨てる
      { target: { x: 900, y: 600, width: 10, height: 10 }, elementIndex: null, text: "外" },
      // 空の説明文 → 捨てる
      { target: { x: 10, y: 10, width: 10, height: 10 }, elementIndex: null, text: "  " },
    ],
  };

  it("座標をキャンバスに戻し、DOM 要素の矩形に合わせ、提案中の注釈にする", () => {
    const suggestions = toSuggestions(output, { doc, image, dom });
    expect(suggestions).toHaveLength(2);
    const [first, second] = suggestions;
    expect(first?.annotations[0]).toMatchObject({
      type: "rect",
      status: "suggested",
      x: 96,
      y: 196,
      w: 308,
      h: 68,
    });
    expect(second?.annotations[0]).toMatchObject({ x: 96, y: 396, w: 308, h: 48 });
    const note = first?.annotations[1];
    expect(note).toMatchObject({
      type: "callout",
      status: "suggested",
      text: "「通知を保存」をクリックします。",
      anchor: { side: "right" },
    });
    // 吹き出しは画像の中に収まる
    if (note?.type !== "callout") throw new Error();
    expect(note.x + note.w).toBeLessThanOrEqual(doc.canvas.width);
    // ID は既存の注釈・他の提案と重ならない
    const ids = suggestions.flatMap((s) => s.annotations.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("DOM がなければ推定した範囲をそのまま使い、既存の注釈の ID と重ねない", () => {
    const withExisting = {
      ...doc,
      annotations: [{ id: "ai-box-1", type: "rect" as const, x: 0, y: 0, w: 10, h: 10 }],
    };
    const [s] = toSuggestions(output, { doc: withExisting, image });
    expect(s?.annotations[0]).toMatchObject({ id: "ai-box-2", x: 100, y: 192, w: 304, h: 76 });
  });

  it("プロンプトに意図・画像の大きさ・既存の注釈・要素の一覧を含める", async () => {
    const client = mockClient({ suggestions: [] });
    await suggestAnnotations({ client, image, doc, intent: "通知の設定方法", dom });
    const prompt = client.calls[0]?.prompt ?? "";
    expect(prompt).toContain("通知の設定方法");
    expect(prompt).toContain("800x500");
    // 要素の座標は送った画像の座標（1/2）で伝える
    expect(prompt).toContain("0: button (50, 100, 150x30) 通知を保存");
    expect(buildSuggestPrompt({ image, doc, intent: "" })).toContain("指定なし");
  });

  it("NFR-I18N-01: 表示言語が英語なら、説明文を英語で書くよう頼み、文字数の上限を広げる", async () => {
    expect(buildSuggestPrompt({ image, doc, intent: "", language: "en" })).toContain("英語で書く");
    expect(buildSuggestPrompt({ image, doc, intent: "" })).not.toContain("英語で書く");
    const long = "Click the Save button. ".repeat(10);
    const output = {
      suggestions: [
        { target: { x: 50, y: 100, width: 150, height: 30 }, elementIndex: null, text: long },
      ],
    };
    const [en] = toSuggestions(output, { image, doc, language: "en" });
    const [ja] = toSuggestions(output, { image, doc });
    expect(en?.text.length).toBeGreaterThan(ja?.text.length ?? 0);
  });

  it("LLM の出力がスキーマに合わなければ使わない", async () => {
    const client = mockClient({ suggestions: [{ target: "左上", text: 1 }] });
    await expect(suggestAnnotations({ client, image, doc, intent: "" })).rejects.toThrow();
  });
});

describe("個人情報の検出（FR-PII-01, 02）", () => {
  it("DOM のテキストからメール・電話番号を、入力欄の手がかりから氏名を見つける", () => {
    expect(detectPiiInDom(dom).map((f) => f.kind)).toEqual(["email", "phone", "name"]);
  });

  it("画像の検出と DOM の検出を合わせ、重なりは 1 つにする。既定はダミー置換", () => {
    const output = {
      findings: [
        // DOM のメールと同じ場所 → まとめる
        {
          kind: "email" as const,
          box: { x: 601, y: 21, width: 178, height: 18 },
          text: "sato.hanako@corp.example",
        },
        { kind: "name" as const, box: { x: 20, y: 20, width: 80, height: 16 }, text: "山田 太郎" },
        { kind: "face" as const, box: { x: 700, y: 400, width: 60, height: 60 }, text: "" },
      ],
    };
    const found = mergePiiFindings(output, { image, canvas: doc.canvas, dom });
    expect(found.map((f) => [f.kind, f.source])).toEqual([
      ["email", "dom"],
      ["phone", "dom"],
      ["name", "dom"],
      ["name", "image"],
      ["face", "image"],
    ]);
    const name = found[3];
    expect(name?.rect).toEqual({ x: 38, y: 38, w: 164, h: 36 });
    expect(name?.method).toBe("replace");
    expect(found[4]?.method).toBe("fill");
    // ダミー値に元の文字列を残さない
    for (const f of found) {
      if (f.text !== "") expect(f.replacement).not.toContain(f.text);
    }
  });

  it("ダミー値は種類と形を保つ", () => {
    expect(dummyFor("name", "山田 太郎", 0)).toBe("佐藤 花子");
    expect(dummyFor("name", "Taro Yamada", 1)).toBe("Ichiro Suzuki");
    expect(dummyFor("email", "taro@corp.example", 0)).toBe("user1@example.com");
    expect(dummyFor("phone", "090-1234-5678")).toBe("000-0000-0000");
    expect(dummyFor("id", "AB-1234 99")).toBe("XX-0000 00");
  });
});

describe("Claude API クライアント", () => {
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
        headers: { "content-type": "application/json", "request-id": "req_test" },
      });
    }) as typeof globalThis.fetch;
    return { fetch, captured };
  }

  const message = (stopReason: string, text: string) => ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_MODEL,
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });

  it("画像と構造化出力のスキーマを送り、応答を検証して返す", async () => {
    const { fetch, captured } = fakeFetch(200, message("end_turn", '{"suggestions":[]}'));
    const client = createAnthropicClient({ apiKey: "sk-test-key", fetch, browser: true });
    const result = await suggestAnnotations({ client, image, doc, intent: "設定" });
    expect(result).toEqual([]);
    const req = captured[0];
    expect(req?.url).toContain("/v1/messages");
    expect(req?.headers.get("x-api-key")).toBe("sk-test-key");
    expect(req?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(req?.body).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
    if (req === undefined) throw new Error("リクエストが送られていない");
    const content = (req.body.messages as { content: { type: string }[] }[])[0]?.content;
    expect(content?.[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "/9j/2Q==" },
    });
  });

  it("認証エラー・拒否は理由付きのエラーにし、API キーを含めない", async () => {
    const unauthorized = fakeFetch(401, {
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    });
    const client = createAnthropicClient({ apiKey: "sk-secret", fetch: unauthorized.fetch });
    const error = await suggestAnnotations({ client, image, doc, intent: "" }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("auth");
    expect(String(error.message)).not.toContain("sk-secret");

    const refused = fakeFetch(200, message("refusal", ""));
    const client2 = createAnthropicClient({ apiKey: "sk-secret", fetch: refused.fetch });
    await expect(
      suggestAnnotations({ client: client2, image, doc, intent: "" }),
    ).rejects.toMatchObject({ kind: "refusal" });
  });
});
