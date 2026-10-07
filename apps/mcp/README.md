# @anoi/mcp

Anoi ファイル（保存後も注釈を再編集できる JPEG / PNG）を読み書きするローカル MCP サーバー（stdio）。
Claude などの MCP クライアントから「この画像に枠を付けて」「この説明文を直して」と頼めるようにする。

サーバーは LLM を呼ばない。画像を見て注釈を考えるのはクライアント側の LLM で、サーバーは読み書きと描画だけを行う。

## ツール

| ツール | 内容 |
|---|---|
| `anoi_open` | ファイルを開き、注釈の一覧と画像を返す。普通の画像なら `status: plain` |
| `anoi_create` | 普通の JPEG / PNG から Anoi ファイルを作る（既定は `<名前>.anoi.<拡張子>`。元画像は残す） |
| `anoi_preview` | 注釈の変更（ops）を適用した画像を返す。ファイルは変えない |
| `anoi_edit` | 注釈の変更を適用し、描き直して上書き保存する。`expectedRevision` で楽観的ロック |
| `anoi_list` | ディレクトリ内の Anoi ファイルを一覧する |

操作できるのは `--root` で指定したディレクトリ配下だけ（既定はカレントディレクトリ）。個人情報の加工（ベース画像の書き換え）は誤操作で元画像を失うおそれがあるため、MCP ではまだ提供していない。

## セットアップ（リポジトリから）

npm には未公開。リポジトリをビルドして使う。

```sh
pnpm install
pnpm build   # apps/mcp/dist/index.mjs と dist/fonts/ ができる
```

### Claude Code

```sh
claude mcp add anoi -- node /path/to/anoi/apps/mcp/dist/index.mjs --root ~/Pictures/guides
```

### Claude Desktop（`claude_desktop_config.json`）

```json
{
  "mcpServers": {
    "anoi": {
      "command": "node",
      "args": ["/path/to/anoi/apps/mcp/dist/index.mjs", "--root", "/Users/you/Pictures/guides"]
    }
  }
}
```

### 使い方の例

- 「`settings.png` を Anoi ファイルにして、保存ボタンを赤枠で囲み、『ここで保存します』と吹き出しを付けて」
- 「`guides/` の Anoi ファイルを一覧して、タイトルのないものにタイトルを付けて」

## 開発

- `src/tools.ts`: ツールの本体。`src/server.ts`: MCP への登録と入力の検証。`src/paths.ts`: root 外へのアクセス防止。
- テスト（`pnpm test`）は SDK の InMemoryTransport でクライアントとつなぎ、ツールを実際に呼ぶ。
- 配布物には Noto Sans JP の Regular / Bold だけを同梱する（`scripts/copy-assets.mjs`、ライセンスは `dist/fonts/OFL.txt`）。
