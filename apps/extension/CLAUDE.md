# apps/extension

Chrome 拡張（WXT, Manifest V3）。表示中のタブをキャプチャし、拡張の中のエディタページで編集・保存する。構成と権限は [integrations.md 1 章](../../docs/03-design/integrations.md)。

- 権限は `activeTab`・`scripting`・`downloads` だけ（NFR-SEC-03）。増やすときは `STORE.md` の説明も書き、PR で理由を示す。`host_permissions` は E2E 用ビルド（`HARIE_E2E=1`）にだけ付ける。ページ上の Harie 画像（`entrypoints/page.ts`）のサイト権限は `optional_host_permissions` で、ポップアップでオンにしたときだけ求め、background が `registerContentScripts` で許可されたサイトにだけ入れる（integrations.md 1.5）。
- ページ用スクリプトから来るメッセージは zod で確かめる。注釈データ（中身）をページに返すのは GitHub のページで GitHub の画像を読むときだけ。ページ用スクリプトは zod を含まないよう、`@harie/model` は `@harie/model/file-name` だけを読む。
- ページに注入するコード（`lib/collect.ts` の `collectDomSnapshot`、`entrypoints/select.ts`）はページの中で動く。`collectDomSnapshot` は関数ごと送るので、外の変数・import を使わない。
- 選択オーバーレイは消してから撮る（写り込み防止）。ページから来る範囲は数値か確かめてから使う。
- DOM 情報は AI にだけ使い、保存ファイルに入れない。パスワード欄の値は取らない。
- 編集画面は `@harie/web` の `Workspace` をそのまま使う。拡張だけの違い（保存は `chrome.downloads`、DOM 情報を渡す）は `entrypoints/editor/main.tsx` に置く。
- 描画エンジンは WASM なので、拡張ページの CSP に `'wasm-unsafe-eval'` を付けている（`wxt.config.ts`）。

## コマンド

```sh
pnpm --filter @harie/extension dev        # 開発用（WXT が Chromium を起動し、変更を読み込み直す）
pnpm --filter @harie/extension build      # 配布用 → .output/chrome-mv3/
pnpm --filter @harie/extension zip        # ストア提出用の zip
pnpm --filter @harie/extension e2e        # 配布用とテスト用をビルドし、拡張を読み込んだ Chromium で E2E
```

## 手動テスト（実際の Chrome で）

1. `pnpm --filter @harie/extension build`
2. Chrome で `chrome://extensions` を開き、「デベロッパーモード」を on にして「パッケージ化されていない拡張機能を読み込む」で `apps/extension/.output/chrome-mv3` を選ぶ。
3. 適当なウェブページで、ツールバーの Harie を押し、次を確かめる。
   - 「見えている範囲」: 新しいタブでエディタが開き、画面と同じ画像が出る。
   - 「範囲を選ぶ」: ドラッグした範囲だけの画像になる。Esc でやめられる。高解像度ディスプレイでも範囲がずれない。
   - 「要素を選ぶ」: ボタンなどにカーソルを当てると枠が出て、クリックで少し余白を付けて撮れる。
   - Alt+Shift+S（`chrome://extensions/shortcuts` で変更可）で「見えている範囲」が撮れる。
   - 保存するとダウンロードに `*.harie.png` ができ、Web 版の Harie で開くと注釈を直せる。
   - `chrome://` のページでは「このページはブラウザの制限でキャプチャできません」と出る。
4. ポップアップの「ページ上の Harie 画像」の 2 つのスイッチをオンにし（権限を求められる）、次を確かめる。
   - GitHub で `*.harie.png` のファイル（例: このリポジトリの `apps/site/src/assets/tasklane-notifications.harie.png`）を開くと、画像の下に注釈データが出て、コピーできる。PR・コミットの差分でも出る。
   - Harie 画像にカーソルを当てると右上に薄いボタンが出て、押すとエディタで開く。普通の画像には出ない。
   - スイッチをオフにすると、再読み込み後は出なくなる。
