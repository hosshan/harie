// LLM 呼び出しの抽象（architecture 4 章）。提案・PII 検出はこのインターフェースだけに依存し、
// テストではモックを渡す。実装は anthropic.ts
import type { z } from "zod";

/** LLM に渡す画像。座標はこの画像のピクセルで返ってくる */
export type ImageInput = {
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png";
  width: number;
  height: number;
};

export type LlmRequest<T> = {
  system: string;
  prompt: string;
  image: ImageInput;
  /** 構造化出力のスキーマ。LLM の出力はこのスキーマで検証してから使う */
  schema: z.ZodType<T>;
};

export interface LlmClient {
  readonly model: string;
  generate<T>(request: LlmRequest<T>): Promise<T>;
}

/** 利用者に見せる理由付きの失敗（キーが違う、クレジットが足りない、断られた、形式が違う等） */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "auth"
      | "credits"
      | "rate-limit"
      | "refusal"
      | "invalid-output"
      | "network"
      | "other",
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** LLM に送る画像の最大辺。これより大きい画像は呼び出し側で縮小して送る */
export const MAX_IMAGE_EDGE = 1568;

/** 縦横比を保って maxEdge に収める大きさと、元の座標に戻す倍率 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number; scale: number } {
  const k = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * k), height: Math.round(height * k), scale: 1 / k };
}
