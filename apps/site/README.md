# apps/site

Harie の LP（GitHub Pages）。ビルドの要らない静的な HTML / CSS / JS で、`src/` をそのまま `dist/` に写して公開する。訴求の整理は [docs/02-research/lp-positioning.md](../../docs/02-research/lp-positioning.md)。

- 公開先: `https://harie.studio/`（LP 日本語）、`/en/`（LP 英語）、`/app/`（Web エディタ）。独自ドメインは GitHub の Settings → Pages の Custom domain で設定する（Actions で公開しているので `CNAME` ファイルは置かない）
- 日本語と英語の 2 ページを同じ構成で持つ。文言を変えたら両方を直す。言語はヘッダーのリンクで切り替え、ブラウザの言語による自動の振り分けはしない（`hreflang` で検索エンジンに対応を伝える）
- 公開: `main` に `apps/site`・`apps/web`・`packages` の変更が入ると [.github/workflows/pages.yml](../../.github/workflows/pages.yml) が動く。Actions の画面から手動でも動かせる。

## ローカルで確かめる

```sh
pnpm --filter @harie/site preview   # http://localhost:4173/
```

LP の「ブラウザで使う」（`./app/`）まで確かめるときは、エディタも同じ形でビルドして入れる。

```sh
HARIE_WEB_BASE=/app/ pnpm --filter @harie/web build
HARIE_SITE_APP_DIR=$PWD/apps/web/dist pnpm --filter @harie/site build
node apps/site/scripts/serve.mjs
```

## ファイル

| パス | 内容 |
|---|---|
| `src/index.html`・`src/en/index.html` | 日本語版・英語版のページ本体。リンクはすべて相対パスにして、公開先のパスに依存させない（OGP の URL だけは絶対） |
| `src/robots.txt`・`src/sitemap.xml`・`src/llms.txt` | 検索エンジンと AI 向けの案内。クローラーはすべて許可し、サイトマップには日英の対応（`hreflang`）を書く。`llms.txt` は LLM 向けの英語の要約で、提供状況や機能を変えたらここも直す |
| `src/styles.css` | 見た目。色は [docs/brand](../../docs/brand/README.md) の配色 |
| `src/main.js` | 注釈の付け外しスイッチ、MCP の登録方法のタブ、コマンドのコピー（両言語で共通。文言は HTML 側に持つ） |
| `src/assets/tasklane-notifications.harie.png`・`.en.harie.png` | 見本の Harie ファイル。架空の SaaS「Tasklane」の画面（日本語は `apps/mcp/eval/fixtures/notifications.png`、英語は `demo/notifications.en.html` を 1280×720 で撮ったもの）に注釈を付け、氏名をダミーに置き換えたもの。LP からダウンロードしてエディタで開ける |
| `src/assets/demo-*.webp`・`pii-*.webp`（英語版は `*.en.webp`） | 見本ファイルから作った表示用の画像（注釈あり・なし、個人情報の加工前・後の切り抜き） |
| `src/assets/og.png`・`og.en.png` | SNS 用の画像（1200×630）。各言語のヒーローを撮ったもの |

## 検索エンジンと AI 向けの情報

- 各ページに `canonical` と `hreflang` を置く。LP の 2 ページには構造化データ（JSON-LD の `WebSite`・`SoftwareApplication`・`FAQPage`）を `<head>` に書く
- `FAQPage` の質問と答えは、ページの「よくある質問」の節と同じ文にする。`pnpm --filter @harie/site build` の最初に [scripts/check-seo.mjs](scripts/check-seo.mjs) が、この一致、`canonical` と `og:url` の一致、`sitemap.xml` の URL に対応するページがあることを確かめ、ずれていればビルドを止める
- よくある質問の答えは畳まずに全部見せる（AI の回答に引かれやすいよう、1 つの答えだけで意味が通る文にする）

見本の画像を作り直すときは、開発用 CLI（`pnpm harie create` → `mask` → `render`）で Harie ファイルを作り、注釈あり・なしの画像を書き出す。実在の個人情報やサービス名を使わない。
