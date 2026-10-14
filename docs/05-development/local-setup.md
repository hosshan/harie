# ローカルでの起動と確認

- ステータス: 確定
- 最終更新: 2026-10-14
- 関連: [開発ルール](./development-rules.md) / [連携設計](../03-design/integrations.md)

手元で Harie の各アプリを動かして確かめる手順。細かい内容は各アプリの文書に書き、ここからリンクする。

## 0. 準備

- Node 22 以上、pnpm 10（`corepack enable` で `packageManager` の版が使われる）。
- Chrome（拡張の確認に使う）。

```sh
pnpm install
pnpm check    # lint + typecheck + test。ここが通れば環境は整っている
```

試しに使う画像は `packages/format/fixtures/`（`base.jpg` / `base.png` は普通の画像、`rendered.*` は Harie ファイル）にある。

## 1. Web エディタ（apps/web）

```sh
pnpm --filter @harie/web dev        # http://localhost:5173/
```

- 画像を開く → 注釈を付ける → 保存 → 保存したファイルを開き直して注釈を直せることを確かめる。
- 本番と同じビルド（PWA・WASM の precache を含む）で見るときは `pnpm --filter @harie/web build && pnpm --filter @harie/web preview`。
- AI の提案・個人情報の検出は、画面で自分の Claude API キーを入れると使える（BYOK、ブラウザの localStorage に保存）。
- 詳細（テスト・リリース）: [apps/web/README.md](../../apps/web/README.md)

## 2. Chrome 拡張（apps/extension）

```sh
pnpm --filter @harie/extension dev      # WXT が拡張入りの Chromium を起動し、変更を読み込み直す
pnpm --filter @harie/extension build    # 実際の Chrome で試す配布用 → apps/extension/.output/chrome-mv3/
```

実際の Chrome では `chrome://extensions` →「デベロッパーモード」→「パッケージ化されていない拡張機能を読み込む」で `.output/chrome-mv3` を選ぶ。確認項目は [apps/extension/CLAUDE.md の「手動テスト」](../../apps/extension/CLAUDE.md#手動テスト実際の-chrome-で)、ストアへの提出手順は [apps/extension/README.md](../../apps/extension/README.md) にある。

## 3. MCP サーバー（apps/mcp）

```sh
pnpm build    # apps/mcp/dist/index.mjs ができる
claude mcp add harie -- node "$PWD/apps/mcp/dist/index.mjs" --root ~/Pictures/guides
```

Claude Code（または Claude Desktop）から「`settings.png` を Harie ファイルにして、保存ボタンを赤枠で囲んで」のように頼む。操作できるのは `--root` 配下だけ。Claude Desktop の設定とツール一覧は [apps/mcp/README.md](../../apps/mcp/README.md)。

## 4. 開発用 CLI（apps/cli）

ビルド不要。ファイルの中身や保存結果を確かめるのに使う。

```sh
pnpm harie --help
pnpm harie create packages/format/fixtures/base.png -o /tmp/sample.harie.png --title サンプル
pnpm harie inspect /tmp/sample.harie.png       # 状態・注釈・PII 加工の件数を表示
pnpm harie extract /tmp/sample.harie.png --doc /tmp/doc.json
```

相対パスはリポジトリの直下から見たもの。コマンド一覧: [apps/cli/README.md](../../apps/cli/README.md)

## 5. AI の評価（packages/ai）

合成画面で、個人情報の検出と補足提案の精度を測る。実際に Claude を呼ぶ（利用枠・費用を使う）。

```sh
cp packages/ai/.env.example packages/ai/.env   # CLAUDE_CODE_OAUTH_TOKEN か ANTHROPIC_API_KEY を書く
pnpm --filter @harie/ai eval
```

トークンの作り方・出力の読み方・過去の結果: [packages/ai/CLAUDE.md の「評価」](../../packages/ai/CLAUDE.md#評価)

## 6. E2E

```sh
pnpm e2e    # Web エディタと Chrome 拡張の Playwright テスト
```

Playwright のブラウザが入っていない環境では `HARIE_CHROMIUM_PATH=/path/to/chromium pnpm e2e` で指定する。
