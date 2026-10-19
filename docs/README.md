# Harie ドキュメント

| 区分 | 文書 | 内容 |
|---|---|---|
| 要求 | [要求整理](01-requirements/requirements-analysis.md) | ターゲット、課題、提供価値、利用シナリオ |
| 要件 | [要件定義](01-requirements/requirements-definition.md) | 機能・非機能要件（ID 付き）、MVP の範囲 |
| 調査 | [アプリ基盤](02-research/app-platform.md) | Tauri 2 / Flutter / Electron などの比較 |
| 調査 | [画像保存方式](02-research/image-storage.md) | 通常画像のまま再編集可能にする方式、PoC |
| 調査 | [描画・保存の性能](02-research/rendering-performance.md) | resvg-wasm と mozjpeg での保存時間（NFR-PERF-01）、ライセンス |
| 調査 | [MCP の効果検証](02-research/mcp-effectiveness.md) | MCP あり／なしでのコンテキスト効率と品質の比較 |
| 調査 | [LP の訴求整理](02-research/lp-positioning.md) | 近いツールの訴求と、LP で Harie が言うこと・言わないこと |
| 設計 | [アーキテクチャ](03-design/architecture.md) | 全体構成、パッケージ、主要フロー |
| 設計 | [ファイル形式仕様](03-design/harie-format-spec.md) | Harie ファイルのバイナリ仕様 |
| 設計 | [注釈ドキュメントモデル](03-design/document-model.md) | 注釈 JSON の構造と操作 |
| 設計 | [連携設計](03-design/integrations.md) | Chrome 拡張、MCP サーバー |
| 計画 | [実装計画](04-plan/implementation-plan.md) | マイルストーン、リスク |
| 開発 | [ローカルでの起動と確認](05-development/local-setup.md) | Web・拡張・MCP・CLI・AI 評価を手元で動かす手順 |
| 開発 | [開発ルール](05-development/development-rules.md) | ブランチ、コミット、テスト、規約 |
| 開発 | [AI 開発ハーネス](05-development/ai-harness.md) | CLAUDE.md・ADR・フック等の仕組み |
| ブランド | [ロゴと配色](brand/README.md) | ロゴの形・比率、配色と使い方 |
| 判断 | [ADR 一覧](adr/README.md) | 設計判断の履歴 |
| 共通 | [用語集](glossary.md) | |

## 文書の約束

- 各文書の冒頭にステータス（ドラフト / 確定）と最終更新日を書く。
- 「今の形」は設計書、「なぜそうしたか」は ADR に書く。
- 要件 ID は削除しない。不要になったら「廃止」と書く。
