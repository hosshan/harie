# harie

Annotation Image Application: Web サービス向けのガイド作成などで、スクリーンショットに枠・矢印・説明文を付けるアプリ。保存した画像は通常の JPEG / PNG として表示でき、Harie で開けば注釈を何度でも再編集できる。

- ドキュメント: [docs/](docs/README.md)
- 設計判断: [docs/adr/](docs/adr/README.md)
- AI エージェント向け: [CLAUDE.md](CLAUDE.md)

現在は M0（基盤整備）。`pnpm install && pnpm check` で検証できる。実装計画は [docs/04-plan/implementation-plan.md](docs/04-plan/implementation-plan.md) を参照。

## ライセンス

MIT（[LICENSE](LICENSE)）。同梱するフォント（Noto Sans JP）は SIL Open Font License 1.1。
