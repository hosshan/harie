# apps/mcp

ローカル MCP サーバー（stdio）。設計は [docs/03-design/integrations.md 2 章](../../docs/03-design/integrations.md)、使い方は [README.md](./README.md)。

- ツールの入力は `src/server.ts` で zod スキーマとして宣言し、`packages/model` のスキーマ（`OpSchema` など）を再利用する。
- ファイルパスは必ず `RootGuard.resolve()` を通す。root の外（`..`・絶対パス・シンボリックリンク）を扱わない。
- 利用者（LLM）の入力ミスは `ToolError` で返し、ツール結果の `isError` にする。
- stdout は MCP の通信に使う。ログは `console.error` に出す。
- PII 加工のツールは確認付きの専用ツールとして Next で追加する（integrations.md）。それまで追加しない。

## npm への公開（`@harie/mcp`）

`@harie` スコープの npm org（オーナーは Shun）で公開する。クラウドの環境には npm の認証がないので、公開は手元の端末で行う。

```sh
# 1. version を上げる（apps/mcp/package.json。初回は 0.1.0）
# 2. npm にログインする（1 回だけ）
npm login
# 3. 公開する（prepublishOnly でビルドしてから出す。publishConfig.access は public）
pnpm --filter @harie/mcp publish
# 4. 確かめる
npm view @harie/mcp version   # 公開した版が出る。あとは README のとおり Claude Code に登録して /mcp で確かめる
```

- 中身は `dist/`（1 ファイルにまとめたサーバーと Noto Sans JP の Regular / Bold、フォントのライセンス）と README・LICENSE（MIT。リポジトリ直下と同じ内容）だけ。`pnpm --filter @harie/mcp pack` で事前に確かめられる。
- `@harie/model`・`format`・`render` はビルド時に取り込むので、公開しなくてよい。
