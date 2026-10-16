# 開発ルール

- ステータス: ドラフト（コード導入時に確定）
- 最終更新: 2026-10-07
- 関連: [AI 開発ハーネス](./ai-harness.md) / [ADR-0003](../adr/0003-monorepo-tooling.md)

人間と AI エージェントの両方が従うルール。AI 向けの要点は [`CLAUDE.md`](../../CLAUDE.md) に抜粋している。

## 1. ブランチと PR

- `main` は常にリリース可能。直接 push しない。
- ブランチ名: `<type>/<短い説明>`（例: `feat/format-jpeg-writer`, `fix/render-badge-offset`, `docs/adr-0009`）。AI エージェントが自動で作るブランチ（`claude/...`）もそのまま可。
- PR は小さく。目安として差分 400 行以内（テスト・フィクスチャ・生成物を除く）。超えるなら分割する。
- PR 本文は [PR テンプレート](../../.github/pull_request_template.md) に従い、関連する要件 ID・ADR を書く。
- マージ方式は squash merge。PR タイトルがコミットメッセージになる。

## 2. コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/ja/) に従う。

```
<type>(<scope>): <要約>

<本文: なぜこの変更が必要か>

Refs: FR-FILE-03, ADR-0004
```

- `type`: `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf` / `ci`
- `scope`: パッケージ名またはアプリ名（`format`, `render`, `mcp`, `extension` など）
- 要約は日本語・英語どちらでもよい（リポジトリ内で混在してよいが、1 コミット内では統一）。

## 3. コーディング規約

- TypeScript `strict`。`any` は禁止（やむを得ない場合は `// biome-ignore` に理由を書く）。
- 整形と Lint は Biome に任せ、議論しない。
- **依存の方向**: `apps → editor / ai → render / format → model`。`model` / `format` / `render` は DOM・React・Node 固有 API に依存しない（バイト列は `Uint8Array`、ハッシュは Web Crypto）。
- 外部入力（ファイル、MCP の引数、LLM の出力）は必ず zod で検証してから使う。
- エラーで落とすより、状態付きの結果を返す（特に `format` の読み込み）。
- コメントは「なぜ」を書く。「何を」はコードで表す。

## 4. テスト

| 種類 | 対象 | 方針 |
|---|---|---|
| 単体 | `model`, `format`, `render`, `ai` | Vitest。純粋関数中心なのでカバレッジを高く保つ |
| ゴールデン | `format` | フィクスチャ（各バージョン・壊れたファイル・外部ツール再保存）で読み書きを固定 |
| ピクセル一致 | `render` | 同じドキュメントをブラウザと Node で描画し、一致を検証 |
| セキュリティ | PII 加工 | 加工後ファイルに元の情報が残らないこと（NFR-SEC-02） |
| E2E | `web`, `extension` | Playwright。主要シナリオ（S1〜S3） |
| AI 評価 | `ai` | 評価用画像セットで提案採用率・PII 検出率を計測。CI ではモック、評価は手動または定期実行 |

- テスト名・`describe` に要件 ID を含める（例: `describe("FR-FILE-04: ベース画像は再エンコードしない", ...)`）。
- バグ修正は、再現するテストを先に書いてから直す。

## 5. ドキュメント

- 仕様・挙動を変える PR は、同じ PR で `docs/` を更新する。
- 後から変えにくい判断は ADR を書く（[ADR 運用ルール](../adr/README.md)）。
- 要件を追加・変更したら [要件定義](../01-requirements/requirements-definition.md) の ID を更新する。ID は削除せず「廃止」と書く。
- ファイル形式を変えるときは [形式仕様](../03-design/harie-format-spec.md) のバージョンを上げ、マイグレーションとフィクスチャを追加する。

## 6. セキュリティ・秘密情報

- API キー・トークンをコミットしない。`.env` は `.gitignore` 済みにし、`.env.example` を置く。
- テスト用画像に実在の個人情報を含めない。ダミーデータで作る。
- Chrome 拡張の権限追加は ADR または PR で理由を説明する。

## 7. 依存関係

- 新しい依存を追加するときは PR に理由を書く（何を、なぜ、代替は）。
- ライセンスは MIT / Apache-2.0 / BSD / ISC / OFL（フォント）を基本とする。それ以外は確認する。
- WASM・フォントなどサイズの大きい依存は、追加前後のバンドルサイズを PR に記載する。

## 8. リリース

- バージョンは SemVer。ファイル形式のバージョン（`formatVersion`）はアプリのバージョンと独立して管理する。
- リリースは `main` の版を上げるコミットにタグを付けて push し、GitHub Actions に任せる。手元から `npm publish` しない。

| 対象 | タグ | ワークフロー | 行うこと |
|---|---|---|---|
| `@harie/mcp` | `mcp-v<version>` | `.github/workflows/release-mcp.yml` | タグと `apps/mcp/package.json` の版の一致を確認 → `pnpm check` → npm に公開（Trusted Publishing、provenance 付き。公開済みの版なら飛ばす）→ GitHub Release に tarball を添付 |
| Chrome 拡張 | `extension-v<version>` | `.github/workflows/release-extension.yml` | 版の一致を確認 → `pnpm check` と拡張の E2E → ストア提出用 zip を GitHub Release に添付。ストアへのアップロードは手動（[apps/extension/README.md](../../apps/extension/README.md#リリース)） |

手順（`@harie/mcp` の例）:

1. `apps/mcp/package.json` の `version` を上げる PR を出し、マージする。
2. `main` を最新にしてタグを付けて push する。

   ```sh
   git switch main && git pull
   git tag mcp-v0.4.0 && git push origin mcp-v0.4.0
   ```

3. Actions の「Release @harie/mcp」が緑になり、npm と GitHub Release に出たことを確かめる。

npm への認証は Trusted Publishing（OIDC）で、リポジトリのシークレットに npm トークンを置かない。npmjs.com の `@harie/mcp` → Settings → Trusted Publisher に、GitHub Actions・`hosshan`・`harie`・`release-mcp.yml`・環境 `npm` を登録しておく。
