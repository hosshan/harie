// AI の評価（実装計画 M4）。合成画面で、個人情報の再現率・適合率と、提案が狙いの要素を指す割合を測る。
// Claude API を実際に呼ぶ（費用がかかる）ので CI では動かさない。使い方は packages/ai/CLAUDE.md
import { nodeRenderer } from "../../render/src/test-utils/node-renderer";
import { createAnthropicClient } from "../src/anthropic";
import { fitWithin, MAX_IMAGE_EDGE } from "../src/llm";
import { detectPii } from "../src/pii";
import { suggestAnnotations } from "../src/suggest";
import { scorePii, scoreTargets } from "./score";
import { screens } from "./screens";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (apiKey === undefined || apiKey === "") {
  console.error("ANTHROPIC_API_KEY を設定してください（キーはリポジトリやファイルに書かない）");
  process.exit(1);
}
const client = createAnthropicClient({
  apiKey,
  ...(process.env.HARIE_AI_MODEL ? { model: process.env.HARIE_AI_MODEL } : {}),
});
const renderer = await nodeRenderer();
const base = (await import("node:fs")).readFileSync(
  new URL("../../format/fixtures/base.png", import.meta.url),
);

const pct = (a: number, b: number) => (b === 0 ? "-" : `${Math.round((a / b) * 100)}%`);
let total = { truth: 0, found: 0, hit: 0, correct: 0 };
let targetHits = 0;
const all = screens();

console.log(`model: ${client.model}`);
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

  const suggestions = await suggestAnnotations({
    client,
    image,
    doc: { ...screen.doc, annotations: [] },
    intent: screen.intent,
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
