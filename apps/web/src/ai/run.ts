// AI の呼び出し。Claude API の SDK を含むので、AI を使うときにだけ読み込む（AiPanel から import() する）
import {
  createAnthropicClient,
  type DomSnapshot,
  detectPii,
  type PiiCandidate,
  type Suggestion,
  suggestAnnotations,
} from "@harie/ai";
import type { HarieDocument } from "@harie/model";
import { prepareImage } from "./image";

type Base = { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" };

const client = (apiKey: string) => createAnthropicClient({ apiKey, browser: true });

export async function runSuggest(
  apiKey: string,
  base: Base,
  doc: HarieDocument,
  intent: string,
  language: "ja" | "en",
  dom?: DomSnapshot,
): Promise<Suggestion[]> {
  const image = await prepareImage(base, doc.canvas);
  return suggestAnnotations({
    client: client(apiKey),
    image,
    doc,
    intent,
    language,
    ...(dom === undefined ? {} : { dom }),
  });
}

export async function runDetectPii(
  apiKey: string,
  base: Base,
  doc: HarieDocument,
  dom?: DomSnapshot,
): Promise<PiiCandidate[]> {
  const image = await prepareImage(base, doc.canvas);
  return detectPii({
    client: client(apiKey),
    image,
    canvas: doc.canvas,
    ...(dom === undefined ? {} : { dom }),
  });
}
