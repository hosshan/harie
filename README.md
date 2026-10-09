# harie

Annotation Image Application: Web サービス向けのガイド作成などで、スクリーンショットに枠・矢印・説明文を付けるアプリ。保存した画像は通常の JPEG / PNG として表示でき、Harie で開けば注釈を何度でも再編集できる。

- ドキュメント: [docs/](docs/README.md)
- 設計判断: [docs/adr/](docs/adr/README.md)
- AI エージェント向け: [CLAUDE.md](CLAUDE.md)

MVP（M0〜M5: Web エディタ・Chrome 拡張・MCP サーバー・AI 提案と個人情報の加工）を実装済み。手元で動かす手順は [ローカルでの起動と確認](docs/05-development/local-setup.md)、今後の計画は [実装計画](docs/04-plan/implementation-plan.md) を参照。

```sh
pnpm install
pnpm check                      # lint + typecheck + test
pnpm --filter @harie/web dev    # Web エディタ（http://localhost:5173/）
```
