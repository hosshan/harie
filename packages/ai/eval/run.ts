// AI の評価（実装計画 M4）。合成画面で、個人情報の再現率・適合率と、提案が狙いの要素を指す割合を測る。
// Claude API を実際に呼ぶ（費用がかかる）ので CI では動かさない。使い方は packages/ai/CLAUDE.md
import { nodeRenderer } from "../../render/src/test-utils/node-renderer";
import { createAnthropicClient } from "../src/anthropic";
import { AiError, fitWithin, type LlmClient, MAX_IMAGE_EDGE } from "../src/llm";
import { detectPii } from "../src/pii";
import { suggestAnnotations } from "../src/suggest";
import { createAgentClient } from "./agent-client";
import { scorePii, scoreTargets } from "./score";
import { screens } from "./screens";

// 失敗したら理由だけを出して止める（認証の失敗で残りの画面を試し続けない）
process.on("uncaughtException", (e) => {
  console.error(e instanceof AiError ? `失敗: ${e.message}` : e);
  process.exit(1);
});

// 認証: ANTHROPIC_API_KEY があれば Claude API に直接（製品と同じ経路）、なければ CLAUDE_CODE_OAUTH_TOKEN で Claude Code 経由
const model = process.env.HARIE_AI_MODEL || undefined;
const apiKey = process.env.ANTHROPIC_API_KEY;
let client: LlmClient;
let via: string;
if (apiKey !== undefined && apiKey !== "") {
  client = createAnthropicClient({ apiKey, ...(model === undefined ? {} : { model }) });
  via = "Claude API（ANTHROPIC_API_KEY）";
} else if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  client = createAgentClient(model === undefined ? {} : { model });
  via = "Claude Code（CLAUDE_CODE_OAUTH_TOKEN）";
} else {
  console.error(
    "ANTHROPIC_API_KEY か CLAUDE_CODE_OAUTH_TOKEN を設定してください（packages/ai/CLAUDE.md の「評価」）",
  );
  process.exit(1);
}
const renderer = await nodeRenderer();
const base = (await import("node:fs")).readFileSync(
  new URL("../../format/fixtures/base.png", import.meta.url),
);

const pct = (a: number, b: number) => (b === 0 ? "-" : `${Math.round((a / b) * 100)}%`);
let total = { truth: 0, found: 0, hit: 0, correct: 0 };
let targetHits = 0;
const all = screens();

console.log(`model: ${client.model} / 経由: ${via}`);
for (const screen of all) {
  const { width, height } = screen.doc.canvas;
  // 縮小して送るときと同じ大きさで描く（座標の戻しも含めて評価する）
  const fit = fitWithin(width, height, MAX_IMAGE_EDGE);
  const png = await renderer.render({
    doc: screen.doc,
    base: { bytes: new Uint8Array(base), mediaType: "image/png" },
    output: "png",
  });
  const image = {
    bytes: png,
    mediaType: "image/png" as const,
    width: fit.width,
    height: fit.height,
  };
  if (fit.scale !== 1) throw new Error("評価画面は MAX_IMAGE_EDGE 以下の大きさにする");

  const pii = await detectPii({ client, image, canvas: screen.doc.canvas });
  const score = scorePii(
    pii.map((p) => p.rect),
    screen.pii.map((p) => p.rect),
  );
  total = {
    truth: total.truth + score.truth,
    found: total.found + score.found,
    hit: total.hit + score.hit,
    correct: total.correct + score.correct,
  };

  // 使える提案が 1 つもない（範囲が画像の外など）のは「外れ」として数え、次の画面に進む
  const suggestions = await suggestAnnotations({
    client,
    image,
    doc: { ...screen.doc, annotations: [] },
    intent: screen.intent,
  }).catch((e: unknown) => {
    if (e instanceof AiError && e.kind === "invalid-output") return [];
    throw e;
  });
  const boxes = suggestions.flatMap((s) => s.annotations.filter((a) => a.type === "rect"));
  const hit = scoreTargets(boxes, screen.targets);
  if (hit) targetHits++;

  console.log(
    `${screen.name}: 個人情報 ${score.hit}/${score.truth} 見つけた・候補 ${score.correct}/${score.found} が正解 / 提案 ${suggestions.length} 件・狙いの要素に${hit ? "当たり" : "外れ"}`,
  );
  for (const s of suggestions) console.log(`  - ${s.text}`);
}
console.log(
  `\n個人情報の再現率 ${pct(total.hit, total.truth)}・適合率 ${pct(total.correct, total.found)} / 提案の命中 ${targetHits}/${all.length}`,
);
