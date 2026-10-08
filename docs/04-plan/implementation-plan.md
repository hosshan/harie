# 実装計画

- ステータス: ドラフト
- 最終更新: 2026-10-07
- 関連: [要件定義](../01-requirements/requirements-definition.md) / [アーキテクチャ](../03-design/architecture.md)

## 1. 進め方

- リスクの高いもの（形式・描画の一致・PII の不可逆性）から先に、UI のないパッケージとして作り、テストで固める。
- 各マイルストーンは**動くものとその確認方法**で終わる。期間ではなく完了条件で管理する。
- タスクは GitHub Issue にし、要件 ID を付ける。1 Issue = 1 PR を基本とする。

## 2. マイルストーン

### M0: 基盤整備

| タスク | 完了条件 |
|---|---|
| ✅ docs / ADR / CLAUDE.md（PR #1） | ADR-0002, 0004, 0006 が承認されている |
| ✅ pnpm モノレポ、TS / Biome / Vitest 設定（ADR-0003） | `pnpm check` が通る（`packages/model` にファイル名規則 FR-FILE-06 を実装） |
| ✅ GitHub Actions で `pnpm check` | PR で自動実行される |
| ✅ Claude Code のフック・権限設定（[AI 開発ハーネス](../05-development/ai-harness.md)） | 編集後に format が自動で走る |

### M1: コア（形式・モデル・描画）— UI なし

| タスク | 要件 | 完了条件 |
|---|---|---|
| ✅ `model`: zod スキーマ、`applyOps`、マイグレーション枠 | FR-FILE-07 | 単体テスト |
| ✅ `format`: JPEG 読み書き（PoC を本実装に） | FR-FILE-01, 03, 04 | ゴールデンテスト、ベース画像のバイト一致 |
| ✅ `format`: PNG 読み書き | FR-FILE-02 | 同上 |
| ✅ `format`: 整合性チェック（ハッシュ検証、壊れたファイル） | FR-FILE-05, NFR-DATA-03 | 外部ツール再保存で正しく判定（ImageMagick でのリサイズをテストで再現） |
| ✅ `render`: SVG 生成（rect / arrow / text / callout / badge） | FR-EDIT-01〜04 | スナップショットテスト |
| ✅ `render`: resvg-wasm ラスタライズ・合成・エンコード | NFR-PLAT-05 | Node で決定的な出力。ブラウザとの一致は M3 の E2E で確認済み |
| ✅ `render`: マスク適用（塗りつぶし・モザイク・ぼかし・ダミー置換の描画） | FR-EDIT-05, FR-PII-02〜04 | 加工後に元ピクセルが残らないテスト |
| ✅ CLI（開発用）: `harie inspect/create/render/extract/mask`（`apps/cli`） | FR-FILE-08 | 手元でファイルを検査できる |
| ✅ 性能計測 | NFR-PERF-01 | 2560×1600 で保存 2 秒以内（未達なら ADR-0005 を再評価）。結果は [描画・保存の性能](../02-research/rendering-performance.md) |

### M2: MCP サーバー（最初に価値を確認できる形態）

| タスク | 要件 | 完了条件 |
|---|---|---|
| ✅ `harie_open` / `harie_create` / `harie_edit` / `harie_preview`（＋ `harie_list`） | FR-MCP-01〜04 | Claude Code / Claude Desktop から「この画像に枠を付けて」が通る |
| ✅ ルートディレクトリ制限、楽観的ロック | — | テスト |
| `npx` で起動できるパッケージ化 | — | README の手順で起動（✅ ビルドと README。npm への公開は未実施） |

> M2 を早めに置く理由: UI がなくても「AI が注釈を付けて、後から変更できる画像」という中心価値を確認でき、形式と描画の実戦テストになる。

### M3: Web エディタ（PWA）

| タスク | 要件 | 完了条件 |
|---|---|---|
| ✅ 画像の取り込み（D&D / クリップボード / ファイル） | FR-CAP-05, FR-FILE-08 | E2E |
| ✅ 注釈の追加・選択・移動・リサイズ・削除、Undo/Redo、範囲を選んでのマスク | FR-EDIT-01〜05, 07 | E2E。マスクはベース画像に焼き込み、ブラウザと Node の加工結果がバイト単位で一致 |
| ✅ 保存（File System Access API / ダウンロード）、ファイル名規則 | FR-FILE-06, NFR-PLAT-05 | 保存 → 再読込で同じ状態。ブラウザと Node の保存結果がバイト単位で一致（E2E） |
| ✅ 不整合ファイルの扱い UI | FR-FILE-05 | E2E（外部で編集されたファイルは「保存されていた注釈で開く / 今の画像を下地にする」を選べる） |
| ✅ PWA 化（オフライン、WASM・フォントのキャッシュ） | NFR-PLAT-01 | オフラインで起動し保存まで（E2E、Chromium）。Safari / Firefox は手動確認が残る |

### M4: AI 提案・PII

| タスク | 要件 | 完了条件 |
|---|---|---|
| ✅ `ai`: 補足提案（構造化出力、BYOK） | FR-AI-01, 02 | 評価用画像セットで提案が出る（単体テスト・E2E はモックの API で確認。実 API での計測は未実施） |
| ✅ `ai`: PII 検出（画像のみ / DOM あり） | FR-PII-01 | 評価用セットで検出率を計測（同上。DOM ありは M5 の拡張から渡す） |
| ✅ ダミー置換 | FR-PII-02 | 加工後に元テキストが残らない（検出した文字は既定でダミー置換、顔は塗りつぶし） |
| ✅ 外部送信の明示 UI | NFR-SEC-01 | 送信先の表示と同意のチェックがないと送れない（E2E） |
| ✅ 評価セットと評価スクリプト | — | 提案の命中率・PII の再現率と適合率を数値で出せる（`pnpm --filter @harie/ai eval`。API キーか `CLAUDE_CODE_OAUTH_TOKEN` が要るため CI では動かさない） |

### M5: Chrome 拡張

| タスク | 要件 | 完了条件 |
|---|---|---|
| ✅ 可視範囲・範囲選択・要素選択キャプチャ | FR-CAP-01, 02 | 手動テスト + E2E（E2E は拡張を読み込んだ Chromium で通る。手動テストの手順は `apps/extension/CLAUDE.md`、実施は未） |
| ✅ DOM スナップショット、AI・PII への受け渡し | FR-CAP-03, FR-AI-03 | 枠が要素に吸着する（E2E。要素番号で指した提案が要素の矩形になる） |
| ✅ 拡張ページでエディタ、`chrome.downloads` で保存 | — | キャプチャ → 保存まで一続き（E2E） |
| ✅ Chrome Web Store 申請準備（限定公開） | NFR-SEC-03 | 権限の説明文（`apps/extension/STORE.md`）。申請そのものは未実施 |

**MVP 完了** = M0〜M5。要求整理のシナリオ S1〜S4 が通しで実行できること。

### Next 以降

| マイルストーン | 内容 |
|---|---|
| M6: デスクトップ | Tauri 2 で殻を作る、ファイル関連付け、自動更新 |
| M7: 編集機能の拡充 | スポットライト、プリセット、トリミング、ベース差し替え、全体キャプチャ、DOM 置換キャプチャ |
| M8: クラウド | docId による控え・復元、チーム共有、リモート MCP |
| M9: モバイル | Tauri 2 / PWA で閲覧・簡易編集（ADR-0002 で再評価） |

## 3. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| resvg-wasm + 日本語フォントのサイズ・速度 | 初回ロードが遅い、保存が遅い | M1 で計測。フォントのサブセット・遅延ロード。ADR-0005 の再評価条件 |
| LLM の座標精度が低い | 提案の枠がずれる | DOM スナップショットへのスナップ（FR-AI-03）。画像のみの場合はユーザー調整前提の UI |
| 再エンコードでメタデータが消える | 再編集できなくなる | 不整合検出、原本の置き場所のガイド、将来はクラウド控え |
| PII 検出漏れ | 個人情報の公開 | 保存前の確認ステップ、評価セットで継続計測、「検出は補助でありユーザーが最終確認する」旨の UI |
| Tauri の WebView 差異 | デスクトップで不具合 | Web コアを共有しているので Electron への切替が可能（ADR-0002） |

## 4. 最初に切る Issue（案）

1. M0: モノレポ初期化と `pnpm check`
2. M0: GitHub Actions
3. M1: `packages/model` スキーマと操作
4. M1: `packages/format` JPEG 読み書き（PoC 移植）
5. M1: `packages/render` SVG 生成
6. M1: resvg-wasm によるラスタライズとピクセル一致テスト
