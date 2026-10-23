# Chrome Web Store の掲載情報

Chrome ウェブストアに**公開**（検索に出る）で出すときに、デベロッパー ダッシュボードの各欄へ貼る文言と素材。掲載ページは https://chromewebstore.google.com/detail/harie/dgbghdgnmjcgjdmhfnmcdphkafkbefll （2026-10-23 公開）。権限を増やしたり、外部に送るデータが変わったりしたら、ここと [プライバシーポリシー](../site/src/privacy/index.html)（英語版は `../site/src/en/privacy/index.html`）を同じ PR で直す。

手順の全体（デベロッパー登録、タグから zip を作る、審査に出す）は [README の「リリース」](README.md#リリース)。画面が大きく変わったら `pnpm --filter @harie/extension store-assets` で `store-assets/` を撮り直す。

## ストアの掲載情報

| 欄 | 値 |
|---|---|
| 名前・概要 | manifest の `name`・`description`（`public/_locales/{ja,en}/messages.json`）がそのまま使われる |
| カテゴリ | 仕事効率化（Productivity）の「ツール」 |
| 言語 | 英語（既定）と日本語。言語ごとに説明とスクリーンショットを入れる |
| アイコン | zip の中の `icon/128.png` |
| スクリーンショット | `store-assets/screenshot-{1-capture,2-region,3-editor}.png`（日本語）と `.en.png`（英語）。1280×800。番号の順に並べる |
| プロモーション タイル（小） | `store-assets/promo-small.png`（日本語）と `promo-small.en.png`（英語）。440×280 |
| 公式 URL（ホームページ） | `https://harie.studio/`（英語は `https://harie.studio/en/`） |
| サポート URL | `https://github.com/hosshan/harie/issues` |

### 説明（日本語）

```text
表示中のページをキャプチャして、枠・矢印・番号・説明文を付けた画像を作れます。SaaS の利用ガイドや社内マニュアルの画像づくりに向けたツールです。

保存した画像はふつうの JPEG / PNG なので、どこにでも貼れます。注釈は画像の中に一緒に保存されるので、Harie で開けば、あとから何度でも枠や文字を直せます。ほかの人が作った画像も、同じように直せます。

■ できること
・キャプチャは「見えている範囲」「範囲を選ぶ」「要素を選ぶ」の 3 通り。Alt+Shift+S でも撮れます
・枠、矢印、番号、吹き出し、モザイクやダミーへの置き換え
・保存した画像は Web 版（https://harie.studio/app/）やデスクトップ版でも開いて直せます
・AI による補足の提案と個人情報の検出（任意。自分の Anthropic API キーを登録したときだけ動きます）

■ 権限とデータについて
・ボタンかショートカットを押したタブにだけ、そのときに限ってアクセスします。常時のサイトへのアクセス権は求めません
・開発者のサーバーはなく、画像や操作の記録を開発者が受け取ることはありません
・AI 機能を使うときだけ、同意を確かめてから画像を Anthropic の API に直接送ります

オープンソース（MIT License）です。ソースコード: https://github.com/hosshan/harie
```

### 説明（英語）

```text
Capture the page you're viewing and add boxes, arrows, numbered badges and notes. Harie is made for the screenshots in SaaS user guides and internal manuals.

Saved images are plain JPEG / PNG files, so you can paste them anywhere. The annotations are stored inside the image, so opening it in Harie lets you fix boxes and text again and again, even on images someone else made.

■ What you can do
- Capture the visible area, a region you drag, or a single element. Alt+Shift+S captures the visible area
- Boxes, arrows, numbered badges, callouts, and masking personal data with blur or dummy text
- Open and edit saved images in the web editor (https://harie.studio/app/) or the desktop app
- AI annotation suggestions and personal-data detection (optional; works only with your own Anthropic API key)

■ Permissions and data
- Harie accesses only the tab where you pressed the button or shortcut, and only at that moment. No standing site access is requested
- There are no developer servers; the developer never receives your images or usage records
- Only when you use the AI features, and after you confirm, is the image sent directly to Anthropic's API

Open source (MIT License). Source code: https://github.com/hosshan/harie
```

## プライバシーへの取り組み（Privacy practices）

### 単一用途

```text
表示中のウェブページのスクリーンショットを撮り、枠・矢印・説明文を付けた画像（注釈を後から編集できる JPEG / PNG）を作る。
```

英語で書く場合:

```text
Capture a screenshot of the current web page and turn it into an annotated image (a JPEG / PNG whose boxes, arrows and notes stay editable later).
```

### 権限の正当性

| 権限 | 使う理由 |
|---|---|
| `activeTab` | 利用者がツールバーのボタンかショートカットを押したタブだけを、そのときに限ってキャプチャするため。常時のサイト権限は求めない。 |
| `scripting` | 押したタブに、範囲・要素を選ぶためのオーバーレイと、画面上の要素の位置と文字を読み取る処理を、その都度注入するため。読み取った情報は注釈の位置合わせと個人情報の候補探しにだけ使い、保存ファイルには含めない。 |
| `downloads` | 注釈を付けた画像を、利用者のダウンロードフォルダに保存するため。 |

英語で書く場合:

| Permission | Justification |
|---|---|
| `activeTab` | To capture only the tab where the user pressed the toolbar button or keyboard shortcut, and only at that moment. No persistent host permissions are requested. |
| `scripting` | To inject, on demand into that tab, the overlay for choosing a region or element and a function that reads element positions and text. This information is used only to align annotations and to find personal-data candidates, and is never written into saved files. |
| `downloads` | To save the annotated image to the user's downloads folder. |

### リモートコード

「いいえ、リモートコードは使用していません」を選ぶ。拡張のコードはすべて zip に入っている。CSP の `'wasm-unsafe-eval'` は、同梱した描画エンジン（WASM）をコンパイルするためのもの。

### データの使用

- 収集するデータの種類: **ウェブサイトのコンテンツ**（Website content）だけにチェックする。AI 機能を使うとき、キャプチャ画像とページ要素の位置・文字の一覧を、利用者の API キーで Anthropic の API に送るため。
- ほかの種類（個人を特定できる情報、健康、金融、認証情報、個人的な通信、位置情報、ウェブ履歴、ユーザーのアクティビティ）にはチェックしない。API キーは利用者自身のもので、拡張の中にだけ保存し、開発者には送らない。
- 3 つの宣誓（承認された用途以外で第三者に販売・転送しない、単一用途と関係のない目的に使わない、信用度の判定や融資に使わない）にすべてチェックする。

### プライバシーポリシーの URL

`https://harie.studio/privacy/`（英語版は `https://harie.studio/en/privacy/`）

## データの扱い（プライバシーポリシーの元）

- キャプチャした画像とページの情報は、利用者の端末の中（拡張の IndexedDB）にだけ置き、24 時間より古いものは次のキャプチャのときに消す。
- AI 機能（任意）を使うときだけ、利用者が登録した Anthropic の API キーで、画像とページの要素の一覧を Anthropic の Claude API に送る。送る前に送信先を表示し、利用者の同意を求める。
- API キーは拡張の中の localStorage にだけ保存し、ほかに送らない。
- 開発者のサーバーには何も送らない。解析・広告のための収集はしない。
