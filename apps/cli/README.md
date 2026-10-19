# @harie/cli

Harie ファイルを扱う開発用 CLI。ファイルの中身を確かめたり、保存結果を作ったり、描き直したりするのに使う。TypeScript のソースを tsx で直接読み込むので、ビルドは要らない。

## インストール

配布はしない（`private`）。リポジトリの中で使う。

```sh
pnpm install
pnpm harie --help
```

## コマンド

| コマンド | 内容 |
|---|---|
| `harie inspect <file> [--json]` | ファイルの状態（Harie ファイルか、普通の画像か、壊れているか）と注釈・PII 加工の概要を表示する |
| `harie create <image> [-o out] [--title t] [--format jpeg\|png]` | 普通の画像から Harie ファイルを作る（既定は元画像と同じ形式） |
| `harie render <file> [--doc doc.json] [-o out]` | 注釈（または JSON）で描き直す。`-o` を省くと上書き |
| `harie extract <file> [--doc out.json] [--base out.jpg]` | 注釈 JSON とベース画像を取り出す |
| `harie mask <file> --rect x,y,w,h --method fill\|mosaic\|blur\|replace --kind <種別> [--text ダミー] [-o out]` | 個人情報の加工をベース画像に適用する（元に戻せない） |
| `harie replace-base <file> --image <new> [-o out]` | 注釈を残したまま画像を差し替える（大きさが違えば注釈を比率で合わせる）。`-o` を省くと上書き |

## ローカルでの確認

相対パスはリポジトリの直下から見たもの。

```sh
pnpm harie create packages/format/fixtures/base.png -o /tmp/sample.harie.png --title サンプル
pnpm harie inspect /tmp/sample.harie.png
pnpm harie extract /tmp/sample.harie.png --doc /tmp/doc.json
# /tmp/doc.json を書き換えてから描き直す
pnpm harie render /tmp/sample.harie.png --doc /tmp/doc.json
```

テストは `pnpm test`（リポジトリ全体）で動く。コマンドの本体（`src/commands.ts`）を直接呼んで確かめている。

## リリース

開発用のため配布しない。利用者向けにファイルを操作する手段は MCP サーバー（[apps/mcp](../mcp/README.md)）で提供する。

## 関連する文書

- 開発時の決まり: [CLAUDE.md](CLAUDE.md)
