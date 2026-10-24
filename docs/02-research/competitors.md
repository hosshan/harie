# 競合ツールとの比較

- ステータス: 確定（2026-10 時点の公開情報）
- 最終更新: 2026-10-24
- 関連: [LP の訴求整理](lp-positioning.md)、[要求整理](../01-requirements/requirements-analysis.md)

スクリーンショットに注釈を付けるツールと、手順書・ガイドを作るサービスを、Harie と同じ項目で比べた記録。

## 結論

「書き出した画像そのものを、元ファイルなしで誰でも直せる」ツールは見つからなかった。一方で、MCP 対応（Supademo）や保存後の再編集（Markup Hero、CleanShot X）は、それだけでは Harie だけの特徴ではない。

## 比較表

注釈ツールは「作った本人が自分のアプリで直す」前提、手順書 SaaS は「サービス上で直す」前提。書き出した JPEG/PNG はどれも焼き込みになる。価格は 2026 年の公開情報で、競合が書いた比較記事から取ったものもあるので目安。

| ツール | 種類 | 保存後の再編集 | 出力形式 | AI 提案 | 個人情報の加工 | Chrome 拡張 | MCP | 価格 |
|---|---|---|---|---|---|---|---|---|
| **Harie** | 注釈 | 画像単体で可。受け取った人も直せる | JPEG/PNG（注釈と元画像を埋め込み） | あり（どこを囲み何と書くか。BYOK / OpenRouter） | ダミー置換・モザイク。不可逆。キーなしの DOM 検出あり | あり（ストア公開済み） | あり（注釈を読み書き） | 無料・MIT |
| Snagit | 注釈 | 独自形式 .snagx を自分の Snagit で | 各種画像（焼き込み） | 簡略化・Smart Move など画像加工の AI。補足の提案はなし | Smart Redact（電話・メール・顔を自動でぼかす） | なし（デスクトップ） | なし | $39/年（2025 年からサブスクのみ） |
| CleanShot X | 注釈 | 独自形式で非破壊編集 | 画像（焼き込み） | なし | 手動のモザイク | なし（Mac のみ） | 公式はなし（コミュニティ製がある） | $35 買い切り、Pro $10/月 |
| Shottr | 注釈 | 記載なし（焼き込み） | 画像 | なし（OCR のみ） | 手動のぼかし・モザイク | なし（Mac のみ） | なし | 無料（支払いは任意） |
| Skitch | 注釈 | なし | 画像 | なし | 手動のモザイク | なし | なし | 無料（Mac 版以外は提供終了） |
| Markup Hero | 注釈 | クラウド上で可。共有リンクの画像が差し替わる | クラウド保存・画像書き出し | なし | 手動 | あり | なし（注釈 API はある） | 無料〜$4/月 |
| Scribe | 手順書 SaaS | サービス上で可 | PDF / HTML / Markdown | 手順文の自動生成 | 手動（Pro）、自動は Enterprise | あり | 未確認 | 無料〜$25/月 |
| Tango | 手順書 SaaS | サービス上で可 | PDF / HTML / Markdown | 手順文の自動生成 | 手動（Pro Team）、自動は Enterprise | あり | なし | 無料〜$26/月 |
| Guidde | 動画ガイド SaaS | サービス上で可 | 動画 / PPT / PDF | 説明文・AI 音声 | ぼかし（Pro）、PII は Enterprise | あり | なし | 無料〜$59/月 |
| Supademo | デモ SaaS | サービス上で可 | 共有リンク・埋め込み | あり | 未確認 | あり | あり（2026-04。ホットスポットの文言・画像の差し替え） | 有料 |
| iorad | チュートリアル SaaS | サービス上で可 | 対話型・動画・SCORM | ベータのエージェント | 記載なし | あり | なし | 無料、$200〜500/月 |

「未確認」「記載なし」は公開情報で確かめられなかった項目。Scribe は「Scribe MCP Server」と題した開発資料のページがあるが、中身は読めなかった。

## Harie が言えること

- **画像 1 枚だけで直せる**: 他は独自形式のプロジェクトファイルか、サービス上のデータが要る。ヘルプページに貼った画像を拾って直せるのは Harie だけ。
- **作った人以外が直せる**: 手順書 SaaS は同じワークスペースと契約が要り、Snagit や CleanShot X は元ファイルを持っている人しか直せない。
- **ぼかさずダミーに置き換える**: Snagit、Scribe、Tango はぼかしかモザイク。手順書 SaaS の自動検出は Enterprise プラン限定。
- **無料・オープンソース・手元で完結**: 手順書 SaaS は画像をサーバーに預ける前提。

## 言い方に気をつけること

- **MCP**: 「MCP 対応は他にない」とは言わない。Supademo が 2026-04 に MCP サーバーを出している。ただし対象は Supademo 上のデモなので、「手元の画像ファイルの注釈を AI が直接読み書きできる」なら Harie だけと言える。
- **保存後の再編集**: それだけでは差にならない。差は「普通の画像のまま」「誰でも」にある。
- **手順書の自動生成**: Scribe、Tango、Guidde は操作を記録するだけで手順書になる。Harie は 1 枚ずつ画像を作る道具なので、ここでは比べない。

## 出典

- [Snagit の価格と機能（ScreenSnap Pro、競合の記事）](https://www.screensnap.pro/blog/snagit-pricing)
- [Snagit の MCP 対応状況（xpay）](https://www.xpay.sh/agent-ready-index/snagit/)
- [CleanShot X（The GTM Directory）](https://thegtmdirectory.com/tools/cleanshot-x/md)
- [Shottr 公式](https://shottr.cc/)
- [Skitch の提供終了（TechCrunch）](https://techcrunch.com/?p=1253491)
- [Markup Hero（Capterra）](https://www.capterra.co.uk/software/205064/markup-hero)
- [Scribe の価格（Trainn、競合の記事）](https://trainn.co/blog/scribe-pricing/)
- [Tango の価格（Guidde、競合の記事）](https://www.guidde.com/knowledge-hub/tango-pricing-complete-guide-2026)、[Tango のセキュリティ](https://www.tango.ai/security)
- [Guidde の価格（VibrantSnap、2026-09-30 時点）](https://www.vibrantsnap.com/blog/guidde-pricing)
- [Supademo の MCP サーバー発表](https://supademo.com/blog/product-update-mcp-server)
- [iorad の価格（Supademo、競合の記事）](https://supademo.com/blog/iorad-pricing)
