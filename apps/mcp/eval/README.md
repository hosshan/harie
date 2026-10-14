# MCP の効果検証ハーネス

同じスクリーンショットとお題を、MCP あり（`@harie/mcp`）と MCP なし（Bash と Python で直接描く）の Claude Code に複数回解かせ、トークン量・ツール呼び出しなどの指標と、出来上がった画像の品質を比べる。結果と考察は [docs/02-research/mcp-effectiveness.md](../../../docs/02-research/mcp-effectiveness.md)。

npm には公開しない（`package.json` の `files` は `dist/` だけ）。

## ファイル

| ファイル | 役割 |
|---|---|
| `fixtures/notifications.html` | お題の画面（架空の SaaS。個人情報はダミー） |
| `fixtures/notifications.png` / `ground-truth.json` | `capture.mjs` が作るスクリーンショットと、正解の要素の矩形 |
| `run.mjs` | 条件ごとに `claude -p` を走らせ、トランスクリプト（stream-json）と指標を保存する |
| `judge.mjs` | 出力画像を LLM にルーブリックで採点させる |
| `report.mjs` | 指標と採点を条件ごとに集計し、Markdown の表を出す |

## 使い方

`claude` CLI にログインしていること。1 試行（create + revise）で 0.1〜0.2 USD ほどかかる。

```sh
# お題の画像を作り直すとき（HTML を変えたときだけ）
HARIE_CHROMIUM_PATH=/path/to/chromium node apps/mcp/eval/capture.mjs

# 公開版と MCP なしを各 8 回
node apps/mcp/eval/run.mjs --runs 8 --out /tmp/eval-a
# 手元のビルドを測る（pnpm --filter @harie/mcp build の後）
node apps/mcp/eval/run.mjs --runs 8 --conditions mcp --mcp "node $PWD/apps/mcp/dist/index.mjs" --out /tmp/eval-b

# 採点（既に採点したものは飛ばす。--force で採点し直す）
node apps/mcp/eval/judge.mjs /tmp/eval-a
node apps/mcp/eval/judge.mjs /tmp/eval-b

# 集計（<ラベル>=<出力ディレクトリ>:<条件>）
node apps/mcp/eval/report.mjs "MCP 公開版=/tmp/eval-a:mcp" "MCP 手元=/tmp/eval-b:mcp" "MCP なし=/tmp/eval-a:nomcp"
```

主なオプション（`run.mjs`）: `--model`（既定 `claude-sonnet-5-5`）、`--runs`、`--parallel`、`--conditions mcp,nomcp`、`--tasks create,revise`、`--mcp`（MCP サーバーの起動コマンド）、`--timeout`（秒）。

## 気をつけること

- 子のセッションには親のメモリ・CLAUDE.md・設定を渡さない（`env.mjs`、`--setting-sources ""`）。作業ディレクトリもリポジトリの外に置く。名前からお題以外の情報が漏れないようにするため。
- 採点は LLM なので、ダミー値への置き換えを個人情報と取り違えるなどの誤判定がある。`notes` を読んで、明らかな誤りは採点し直す。
- お題や採点基準を変えたら、前の結果とは比べられない。docs の結果に条件を書き残す。
