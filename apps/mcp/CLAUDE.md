# apps/mcp

ローカル MCP サーバー（stdio）。設計は [docs/03-design/integrations.md 2 章](../../docs/03-design/integrations.md)、使い方は [README.md](./README.md)。

- ツールの入力は `src/server.ts` で zod スキーマとして宣言し、`packages/model` のスキーマ（`OpSchema` など）を再利用する。
- ファイルパスは必ず `RootGuard.resolve()` を通す。root の外（`..`・絶対パス・シンボリックリンク）を扱わない。
- 利用者（LLM）の入力ミスは `ToolError` で返し、ツール結果の `isError` にする。
- stdout は MCP の通信に使う。ログは `console.error` に出す。
- PII 加工のツールは確認付きの専用ツールとして Next で追加する（integrations.md）。それまで追加しない。
