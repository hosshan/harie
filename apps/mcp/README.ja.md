# @harie/mcp

[English](./README.md) | 日本語

Harie ファイル（保存後も注釈を再編集できる JPEG / PNG）を読み書きするローカル MCP サーバー（stdio）。
Claude などの MCP クライアントから「この画像に枠を付けて」「この説明文を直して」と頼めるようにする。

サーバーは LLM を呼ばない。画像を見て注釈を考えるのはクライアント側の LLM で、サーバーは読み書きと描画だけを行う。

## ツール

| ツール | 内容 |
|---|---|
| `harie_open` | ファイルを開き、注釈の一覧と画像を返す。普通の画像なら `status: plain` |
| `harie_create` | 普通の JPEG / PNG から Harie ファイルを作る（既定は `<名前>.harie.<拡張子>`。元画像は残す）。`format`（`jpeg` / `png`）で保存形式を選べる |
| `harie_preview` | 注釈の変更（ops）を適用した画像を返す。ファイルは変えない |
| `harie_edit` | 注釈の変更を適用し、描き直して上書き保存する。`expectedRevision` で楽観的ロック |
| `harie_list` | ディレクトリ内の Harie ファイルを一覧する |
| `harie_mask` | 個人情報をベース画像に焼き込んで隠す（元に戻せない）。`confirm: true` を付けたときだけ保存し、付けなければ加工後の画像を返すだけ |

操作できるのは `--root` で指定したディレクトリ配下だけ（既定はカレントディレクトリ）。個人情報の加工（`harie_mask`）はベース画像を書き換えるので、保存後は元に戻せない。元の画像を残したいときは `outPath` で別のファイルに保存する。

## セットアップ

Node.js 22 以上が要る。npm の `@harie/mcp` を `npx` で起動する。

### Claude Code

```sh
claude mcp add harie -- npx -y @harie/mcp --root ~/Pictures/guides
```

### Claude Desktop（`claude_desktop_config.json`）

```json
{
  "mcpServers": {
    "harie": {
      "command": "npx",
      "args": ["-y", "@harie/mcp", "--root", "/Users/you/Pictures/guides"]
    }
  }
}
```

### リポジトリから動かす（開発用）

```sh
pnpm install
pnpm build   # apps/mcp/dist/index.mjs と dist/fonts/ ができる
claude mcp add harie -- node /path/to/harie/apps/mcp/dist/index.mjs --root ~/Pictures/guides
```

### 手引きのプロンプト（`harie_guide`）

Web エディタの AI 提案と同じ基準を、プロンプト `harie_guide`（引数: `path`、任意で `intent`）として提供する。どの UI 要素を強調するか（説明に必要なものだけ、多くても 8 か所、操作の順）、吹き出しをどう書くか（読者がすることを 1〜2 文で。画面にない機能を作らず、個人情報を書き写さない）、このツールでの手順（開く → 個人情報を隠す → 枠・anchor 付きの吹き出し・番号を置く → 確かめる → 保存）をまとめている。Claude Code では `/mcp__harie__harie_guide` で呼べる。同じ基準の短い版をサーバーの `instructions` でも渡すので、instructions を読むクライアントはプロンプトを使わなくても基準に沿う。

### 使い方の例

- 「`settings.png` を Harie ファイルにして、保存ボタンを赤枠で囲み、『ここで保存します』と吹き出しを付けて」
- 「`guides/` の Harie ファイルを一覧して、タイトルのないものにタイトルを付けて」

## 開発

- `src/tools.ts`: ツールの本体。`src/server.ts`: MCP への登録と入力の検証。`src/paths.ts`: root 外へのアクセス防止。
- テスト（`pnpm test`）は SDK の InMemoryTransport でクライアントとつなぎ、ツールを実際に呼ぶ。
- 配布物には Noto Sans JP の Regular / Bold だけを同梱する（`scripts/copy-assets.mjs`、ライセンスは `dist/fonts/OFL.txt`）。

## ライセンス

MIT。同梱するフォント（Noto Sans JP の Regular / Bold）は SIL Open Font License 1.1（`dist/fonts/OFL.txt`）。
