# CLAUDE.md

Anoi（Annotation Image）: SaaS の利用ガイド用スクリーンショットに枠・矢印・説明文を付けるツール。保存した画像は普通の JPEG/PNG として表示でき、Anoi で開けば注釈を何度でも再編集できる。Web / Chrome 拡張 / デスクトップ / MCP で提供する。

## まず読むもの

- 要求と課題: [docs/01-requirements/requirements-analysis.md](docs/01-requirements/requirements-analysis.md)
- 要件（ID 付き）: [docs/01-requirements/requirements-definition.md](docs/01-requirements/requirements-definition.md)
- アーキテクチャ: [docs/03-design/architecture.md](docs/03-design/architecture.md)
- 判断の履歴: [docs/adr/README.md](docs/adr/README.md)
- 実装計画: [docs/04-plan/implementation-plan.md](docs/04-plan/implementation-plan.md)
- 開発ルール: [docs/05-development/development-rules.md](docs/05-development/development-rules.md)

触る領域に関係する ADR と設計書は、作業前に必ず読むこと。

## リポジトリ構成（`packages/model`・`packages/format`・`packages/render` 以外は未作成。実装計画の順に追加する）

```
apps/web         Web エディタ（Vite + React, PWA）
apps/extension   Chrome 拡張（WXT, MV3）
apps/desktop     デスクトップ（Tauri 2）
apps/mcp         MCP サーバー（Node, stdio）
packages/model   注釈ドキュメントのスキーマと操作（zod）
packages/format  JPEG/PNG への埋め込み・読み出し
packages/render  注釈 → SVG → ピクセル（resvg-wasm）
packages/ai      補足提案・PII 検出
packages/editor  エディタ UI（React）
docs/            要求・要件・調査・設計・計画・ADR・開発ルール
```

## コマンド

```sh
pnpm install
pnpm check        # lint（Biome）+ typecheck + test（Vitest）。PR 前に必ず通す
pnpm test         # テストのみ
pnpm format       # Biome で整形・import 整理
```

- Node 22 / pnpm 10。TypeScript は 7 系（`tsc` はネイティブ版）。
- 新しいパッケージは `packages/model` を雛形にする（`package.json` の `typecheck` スクリプト、`tsconfig.json`、`vitest.config.ts` の `name`）。
- Claude Code のフック（`.claude/settings.json`）: 編集後に Biome で自動整形、クラウド環境では起動時に `pnpm install`。

## 必ず守ること

- **依存の方向**: `apps → editor/ai → render/format → model`。`model` / `format` / `render` は DOM・React・Node 固有 API に依存しない。
- **ベース画像を再エンコードしない**。読み込んだバイト列をそのまま埋め込む（ADR-0004）。
- **PII 加工はベース画像に不可逆に適用する**。可逆な注釈として実装しない（ADR-0007）。
- **描画は `packages/render` の 1 系統のみ**。環境ごとに描画を分岐させない（ADR-0005）。
- 外部入力（ファイル・MCP 引数・LLM 出力）は zod で検証してから使う。
- テスト・フィクスチャに実在の個人情報や秘密情報を含めない。
- 承認済み ADR と矛盾する実装をしない。方式を変えたいときは新しい ADR を `提案中` で書き、実装の前に確認を取る。
- 仕様・挙動を変えたら同じ PR で `docs/` を更新する。テスト名と PR に要件 ID（`FR-*` / `NFR-*`）を書く。
- コミットは Conventional Commits（`feat(format): ...`）。

## 迷ったら

- 推測で実装しない。判断が要る点は ADR の提案か、PR / スレッドでの質問として残す。
- 文書は日本語で書く。
