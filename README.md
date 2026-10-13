# harie

Annotation Image Application: Web サービス向けのガイド作成などで、スクリーンショットに枠・矢印・説明文を付けるアプリ。保存した画像は通常の JPEG / PNG として表示でき、Harie で開けば注釈を何度でも再編集できる。

- ドキュメント: [docs/](docs/README.md)
- 設計判断: [docs/adr/](docs/adr/README.md)
- AI エージェント向け: [CLAUDE.md](CLAUDE.md)

```sh
pnpm install
pnpm check                      # lint + typecheck + test
pnpm --filter @harie/web dev    # Web エディタ（http://localhost:5173/）
```

実装計画は [docs/04-plan/implementation-plan.md](docs/04-plan/implementation-plan.md) を参照。

## パッケージ

| パッケージ | 内容 |
|---|---|
| [packages/model](packages/model/README.md) | 注釈ドキュメントのスキーマと操作 |
| [packages/format](packages/format/README.md) | JPEG / PNG への埋め込み・読み出し |
| [packages/render](packages/render/README.md) | 注釈 → SVG → ピクセルの描画 |
| [packages/ai](packages/ai/README.md) | AI の補足提案と個人情報の検出 |
| [packages/editor](packages/editor/README.md) | エディタ UI（React） |
| [apps/mcp](apps/mcp/README.md) | MCP サーバー |

## ライセンス

MIT（[LICENSE](LICENSE)）。同梱するフォント（Noto Sans JP）は SIL Open Font License 1.1。
MVP（M0〜M5: Web エディタ・Chrome 拡張・MCP サーバー・AI 提案と個人情報の加工）を実装済み。手元で動かす手順は [ローカルでの起動と確認](docs/05-development/local-setup.md)、今後の計画は [実装計画](docs/04-plan/implementation-plan.md) を参照。
