// run.mjs の出力画像を、正解の矩形とルーブリックに沿って LLM に採点させる
// 使い方: node apps/mcp/eval/judge.mjs <run.mjs の出力ディレクトリ> [--model claude-opus-5-5] [--parallel 4]
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { childEnv } from "./env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: "claude-opus-5-5" },
    parallel: { type: "string", default: "4" },
    force: { type: "boolean", default: false },
    tasks: { type: "string", default: "create,revise" },
  },
});
const out = positionals[0];
if (!out) throw new Error("run.mjs の出力ディレクトリを指定してください");

const gt = JSON.parse(readFileSync(join(here, "fixtures/ground-truth.json"), "utf8"));
const box = (k) => {
  const b = gt.boxes[k];
  return `(x=${Math.round(b.x)}, y=${Math.round(b.y)}, w=${Math.round(b.w)}, h=${Math.round(b.h)})`;
};
const original = join(here, "fixtures/notifications.png");

const COMMON = `あなたは SaaS の利用ガイド画像の品質を採点するレビュアーです。Read ツールで画像を開いて確かめ、最後に JSON だけを出力してください（前後に説明やコードフェンスを付けない）。
元のスクリーンショット: ${original}（${gt.width}x${gt.height}、注釈なし）
元画像での主な要素の位置（ピクセル、左上原点）:
- Slack に通知するトグル ${box("slack-toggle")}
- 通知先チャンネルのセレクト ${box("channel-select")}
- 保存ボタン ${box("save")}
- 右上の「?」ヘルプアイコン ${box("help")}
- 個人情報1: ヘッダー右上の氏名とメールアドレス ${box("user")}
- 個人情報2: 担当者の氏名とメールアドレス ${box("owner-pii")}
画像の大きさが元と違う場合は、比率で読み替えてください。
元画像の個人情報の値は「山田 太郎 / taro.yamada@example.com」と「佐藤 花子 / hanako.sato@example.com」。これらの値が読めなければ隠せたとみなす（塗りつぶし・モザイク・ぼかし・別のダミー値への置き換えのどれでもよい）。`;

const CREATE = (img) => `${COMMON}

採点する画像: ${img}
お題: 「Slack に通知を送るように設定する手順」の利用ガイド画像。操作する箇所を枠で囲み、操作の順番と短い説明文を添え、個人情報（氏名・メールアドレス）を読めないように加工する。

次の JSON を出力してください。score は 1〜5（5 が最良）。
{
  "targets_covered": 必須の 3 か所（トグル・チャンネル選択・保存ボタン）のうち、枠で正しく囲まれている数 0〜3,
  "extra_targets": 手順に関係ない箇所への枠や強調の数（タブの「外部サービス連携」は手順の一部とみなし数えない）,
  "order_correct": 番号がトグル → チャンネル → 保存の順になっているか true/false,
  "box_fit": 枠が対象の要素にぴったり合っているか score,
  "text_quality": 説明文が正確・簡潔で、読者がすることが分かるか score,
  "legibility": 文字が欠けず（はみ出し・文字化け・重なりがない）読みやすいか score,
  "layout": 注釈が操作対象や重要な UI を隠さず、配置とスタイルが整っているか score,
  "badges_top_left": 番号がすべて対応する枠の左上の角の外側にそろって置かれているか true/false,
  "badges_clear": 番号と吹き出しが、どの UI 要素（強調していないものも含む）にも重なっていないか true/false,
  "callout_arrows": 手順ごとに説明の吹き出しがあり、それぞれ矢印で対応する枠を指しているか true/false,
  "pii_header_hidden": 個人情報1 が読めないか true/false,
  "pii_owner_hidden": 個人情報2 の氏名とメールアドレスがどちらも読めないか true/false,
  "overall": そのまま利用ガイドに載せられるか score,
  "notes": 減点の理由を 1〜2 文
}`;

const REVISE = (before, img) => `${COMMON}

修正前の画像: ${before}
採点する画像（修正後）: ${img}
お題: 修正前の画像に対して、(a) 通知先チャンネルを選ぶ手順の説明文を「通知を送るチャンネルを選びます（例: #release）」に変える、(b) 右上の「?」アイコンに「困ったときはここから問い合わせできます」という補足を加える、(c) それ以外の注釈と加工はそのまま残す。

次の JSON を出力してください。score は 1〜5（5 が最良）。
{
  "text_changed": (a) の説明文が指定どおりの文言になり、元の文言が残っていないか true/false,
  "help_added": (b) の補足が「?」アイコンを指す形で加わっているか true/false,
  "others_preserved": (c) 他の注釈（枠・番号・説明文）と個人情報の加工が修正前と同じに残っているか true/false,
  "artifacts": 描き直しの跡（古い文字が透けている・二重に描かれている・背景の継ぎはぎ・画質の劣化）がないか true/false（ない = true）,
  "pii_still_hidden": 個人情報 1・2 がどちらも読めないままか true/false,
  "legibility": 文字が欠けず読みやすいか score,
  "overall": そのまま利用ガイドに載せられるか score,
  "notes": 減点の理由を 1〜2 文
}`;

function judge(prompt, cwd) {
  const cli = [
    "-p",
    prompt,
    "--model",
    args.model,
    "--output-format",
    "json",
    "--setting-sources",
    "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--permission-mode",
    "bypassPermissions",
    "--tools",
    "Read",
  ];
  return new Promise((resolve) => {
    const child = spawn("claude", cli, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.on("close", () => {
      try {
        const text = JSON.parse(stdout).result;
        resolve(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
      } catch (e) {
        resolve({ error: String(e), raw: stdout.slice(0, 2000) });
      }
    });
  });
}

const jobs = [];
for (const condition of readdirSync(out, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)) {
  const cdir = join(out, condition);
  for (const run of readdirSync(cdir).filter((d) => d.startsWith("run-"))) {
    const rdir = join(cdir, run);
    for (const task of args.tasks.split(",")) {
      const mpath = join(rdir, `${task}.metrics.json`);
      const jpath = join(rdir, `${task}.judge.json`);
      if (!existsSync(mpath) || (existsSync(jpath) && !args.force)) continue;
      const m = JSON.parse(readFileSync(mpath, "utf8"));
      if (!m.outputImage) {
        writeFileSync(jpath, `${JSON.stringify({ error: "no output image" })}\n`);
        continue;
      }
      const img = join(rdir, task, m.outputImage);
      let prompt = CREATE(img);
      if (task === "revise") {
        const cm = JSON.parse(readFileSync(join(rdir, "create.metrics.json"), "utf8"));
        prompt = REVISE(join(rdir, "create", cm.outputImage), img);
      }
      jobs.push({ prompt, cwd: rdir, jpath });
    }
  }
}
console.error(`${jobs.length} 件を採点します`);
await Promise.all(
  Array.from({ length: Number(args.parallel) }, async () => {
    while (jobs.length > 0) {
      const job = jobs.shift();
      const result = await judge(job.prompt, job.cwd);
      writeFileSync(job.jpath, `${JSON.stringify(result, null, 2)}\n`);
      console.error(job.jpath, result.error ? "ERROR" : `overall=${result.overall}`);
    }
  }),
);
