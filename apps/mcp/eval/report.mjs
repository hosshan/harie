// run.mjs と judge.mjs の結果を条件・お題ごとに集計し、Markdown の表にする
// 使い方: node apps/mcp/eval/report.mjs <ラベル>=<出力ディレクトリ>[:<条件>] ...
//   例: node apps/mcp/eval/report.mjs "MCP 0.2.0=/tmp/a:mcp" "MCP なし=/tmp/a:nomcp" "MCP 0.3.0=/tmp/b:mcp"
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

function load(spec) {
  const [label, rest] = spec.split(/=(.*)/s);
  const [dir, condition = "mcp"] = rest.split(/:(?=[^:]*$)/);
  const cdir = join(dir, condition);
  const runs = readdirSync(cdir)
    .filter((d) => d.startsWith("run-"))
    .map((run) => {
      const rdir = join(cdir, run);
      const t = (task) => ({
        metrics: readJson(join(rdir, `${task}.metrics.json`)),
        judge: readJson(join(rdir, `${task}.judge.json`)),
      });
      return { run, create: t("create"), revise: t("revise") };
    });
  return { label, runs };
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs) => (xs.length < 2 ? 0 : Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2))));
const fmt = (n, digits = 0) =>
  n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

function stat(values, digits = 0) {
  const xs = values.filter((x) => typeof x === "number");
  if (xs.length === 0) return "–";
  return `${fmt(mean(xs), digits)} ± ${fmt(sd(xs), digits)}`;
}

function rate(values) {
  const xs = values.filter((x) => typeof x === "boolean");
  if (xs.length === 0) return "–";
  return `${xs.filter(Boolean).length}/${xs.length}`;
}

const groups = process.argv.slice(2).map(load);
if (groups.length === 0) throw new Error("集計する出力ディレクトリを指定してください");

function table(task, rows) {
  const header = `| 指標 | ${groups.map((g) => g.label).join(" | ")} |`;
  const sep = `|---|${groups.map(() => "---").join("|")}|`;
  const body = rows.map(([name, f]) => {
    const cells = groups.map((g) => f(g.runs.map((r) => r[task]).filter((x) => x.metrics)));
    return `| ${name} | ${cells.join(" | ")} |`;
  });
  return [header, sep, ...body].join("\n");
}

const m = (key, digits) => (xs) =>
  stat(
    xs.map((x) => x.metrics[key]),
    digits,
  );
const j =
  (key, digits = 1) =>
  (xs) =>
    stat(
      xs.map((x) => x.judge?.[key]),
      digits,
    );
const jr = (key) => (xs) => rate(xs.map((x) => x.judge?.[key]));
const n = (xs) => String(xs.length);
const ok = (xs) => rate(xs.map((x) => x.metrics.ok && x.metrics.outputImage !== null));
const toolMix = (xs) => {
  const sum = {};
  for (const x of xs)
    for (const [k, v] of Object.entries(x.metrics.toolCalls)) sum[k] = (sum[k] ?? 0) + v;
  return Object.entries(sum)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k.replace("mcp__harie__", "")} ${fmt(v / xs.length, 1)}`)
    .join("<br>");
};

const CONTEXT = [
  ["試行数", n],
  ["完了（画像を保存）", ok],
  ["入力トークン合計（キャッシュ込み）", m("inputTokensTotal")],
  ["終了時のコンテキスト", m("finalContextTokens")],
  ["出力トークン", m("outputTokensTotal")],
  ["ターン数", m("turns", 1)],
  ["ツール呼び出し数", m("toolCallsTotal", 1)],
  ["失敗したツール呼び出し", m("toolErrors", 1)],
  ["ツール結果の画像の数", m("imagesInResults", 1)],
  ["コスト（USD）", m("costUsd", 3)],
  [
    "所要時間（秒）",
    (xs) =>
      stat(
        xs.map((x) => (x.metrics.durationMs ?? 0) / 1000),
        0,
      ),
  ],
  ["ツールの内訳（1 回あたり）", toolMix],
];

const CREATE_QUALITY = [
  ["必須 3 か所を囲めた数", j("targets_covered", 2)],
  ["余計な強調", j("extra_targets", 2)],
  ["順番が正しい", jr("order_correct")],
  ["個人情報（ヘッダー）を隠せた", jr("pii_header_hidden")],
  ["個人情報（担当者）を隠せた", jr("pii_owner_hidden")],
  ["番号が枠の左上にそろう", jr("badges_top_left")],
  ["番号・吹き出しが UI に重ならない", jr("badges_clear")],
  ["吹き出しが矢印で枠を指す", jr("callout_arrows")],
  ["枠の合い方", j("box_fit")],
  ["説明文", j("text_quality")],
  ["文字の読みやすさ", j("legibility")],
  ["レイアウト", j("layout")],
  ["総合", j("overall")],
];

const REVISE_QUALITY = [
  ["説明文を指定どおりに変えた", jr("text_changed")],
  ["ヘルプの補足を加えた", jr("help_added")],
  ["他の注釈と加工を保った", jr("others_preserved")],
  ["描き直しの跡がない", jr("artifacts")],
  ["個人情報が隠れたまま", jr("pii_still_hidden")],
  ["文字の読みやすさ", j("legibility")],
  ["総合", j("overall")],
];

console.log(`## 作成（create）

### コンテキストと手数（平均 ± 標準偏差）

${table("create", CONTEXT)}

### 品質（LLM 採点。スコアは 1〜5 の平均 ± 標準偏差）

${table("create", CREATE_QUALITY)}

## 修正（revise。作成の結果を別のセッションで直す）

### コンテキストと手数（平均 ± 標準偏差）

${table("revise", CONTEXT)}

### 品質（LLM 採点）

${table("revise", REVISE_QUALITY)}
`);
