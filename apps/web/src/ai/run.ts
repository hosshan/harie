// AI の呼び出し。Claude API の SDK を含むので、AI を使うときにだけ読み込む（AiPanel から import() する）。
// 接続先は Anthropic（API キー）か OpenRouter（ADR-0012）
import {
  createAnthropicClient,
  createOpenRouterClient,
  type DomSnapshot,
  detectPii,
  type PiiCandidate,
  type SuggestContext,
  type Suggestion,
  suggestAnnotations,
} from "@harie/ai";
import type { HarieDocument } from "@harie/model";
import type { AiCredential } from "./api-key";
import { prepareImage } from "./image";

type Base = { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" };

const client = (credential: AiCredential) =>
  credential.provider === "openrouter"
    ? createOpenRouterClient({ apiKey: credential.key, appUrl: window.location.origin })
    : createAnthropicClient({ apiKey: credential.key, browser: true });

export async function runSuggest(
  credential: AiCredential,
  base: Base,
  doc: HarieDocument,
  request: { intent: string; context: readonly SuggestContext[] },
  language: "ja" | "en",
  dom?: DomSnapshot,
  scale = 1,
): Promise<Suggestion[]> {
  const image = await prepareImage(base, doc.canvas);
  return suggestAnnotations({
    client: client(credential),
    image,
    doc,
    intent: request.intent,
    context: request.context,
    language,
    scale,
    ...(dom === undefined ? {} : { dom }),
  });
}

export async function runDetectPii(
  credential: AiCredential,
  base: Base,
  doc: HarieDocument,
  dom?: DomSnapshot,
): Promise<PiiCandidate[]> {
  const image = await prepareImage(base, doc.canvas);
  return detectPii({
    client: client(credential),
    image,
    canvas: doc.canvas,
    ...(dom === undefined ? {} : { dom }),
  });
}
