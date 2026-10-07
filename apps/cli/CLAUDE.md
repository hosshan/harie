# apps/cli

開発用 CLI。`pnpm anoi --help` で使い方を表示する。TypeScript のソースを tsx で直接読み込むので、ビルドは要らない。

- コマンドの本体は `src/commands.ts`。引数の解釈（`src/main.ts`）と分け、テストは本体を直接呼ぶ。
- 利用者の入力ミスは `CliError` で返す（スタックトレースを出さない）。
- Node で WASM とフォントを読む処理は `src/runtime.ts`。描画・形式・モデルの処理をここに書かない（`packages/*` を使う）。
- 外部入力（JSON・引数）は `packages/model` の zod スキーマで検証してから使う。
