# @harie/extension

Harie の Chrome 拡張（WXT, Manifest V3）。表示中のタブをキャプチャし、拡張の中のエディタページで枠・矢印・説明文を付けて保存する。保存した `*.harie.png` は Web 版の Harie でも開いて直せる。

- キャプチャは「見えている範囲」「範囲を選ぶ」「要素を選ぶ」の 3 通り。ショートカットは Alt+Shift+S（見えている範囲）。
- 権限は `activeTab`・`scripting`・`downloads` だけ。ボタンかショートカットを押したタブにだけ、そのときに限ってアクセスする（NFR-SEC-03）。
- ページの要素の位置と文字は AI の位置合わせと個人情報の候補探しにだけ使い、保存ファイルには入れない。
- 編集画面は `@harie/web` の `Workspace` をそのまま使う。

## インストール

Chrome ウェブストアには未公開。今はソースからビルドして読み込む。

1. リポジトリの直下で次を実行する（Node 22 以上と pnpm 10 が要る）。

   ```sh
   pnpm install
   pnpm --filter @harie/extension build    # → apps/extension/.output/chrome-mv3/
   ```

2. Chrome で `chrome://extensions` を開き、「デベロッパーモード」をオンにする。
3. 「パッケージ化されていない拡張機能を読み込む」で `apps/extension/.output/chrome-mv3` を選ぶ。
4. ツールバーの Harie を押すか Alt+Shift+S で撮る。ショートカットは `chrome://extensions/shortcuts` で変えられる。

更新するときは、もう一度ビルドしてから `chrome://extensions` で Harie の再読み込みボタンを押す。

## ローカルでの確認

```sh
pnpm --filter @harie/extension dev      # WXT が拡張入りの Chromium を起動し、変更を読み込み直す
pnpm --filter @harie/extension e2e      # 配布用とテスト用をビルドし、拡張を読み込んだ Chromium で E2E
```

- E2E ではツールバーのボタンを押せないため、テスト用ビルド（`HARIE_E2E=1`、出力は `.output-e2e/`）にだけ全サイトの権限を付けている。配布用には付かない。
- 実際の Chrome での確認項目は [CLAUDE.md の「手動テスト」](CLAUDE.md#手動テスト実際の-chrome-で) にある。

## リリース

Chrome ウェブストアに公開（検索に出る）で出す。初回の申請はまだ。

1. `apps/extension/package.json` の `version` を上げる PR をマージする（WXT は manifest の版にこの値を使う。タグと違うとリリースのワークフローが止まる）。
2. `main` で `extension-v<version>` のタグを push する。GitHub Actions（`release-extension.yml`）が check と E2E のあと、ストア提出用の zip を GitHub Release に添付する。手元で作るときは次のとおり。

   ```sh
   pnpm --filter @harie/extension zip      # → apps/extension/.output/harie-extension-<version>-chrome.zip
   ```

3. zip を展開して `chrome://extensions` で読み込み、[手動テスト](CLAUDE.md#手動テスト実際の-chrome-で)をひととおり行う。
4. Chrome Web Store のデベロッパー ダッシュボードに zip を上げる。掲載情報・プライバシーへの取り組みの欄は [STORE.md](STORE.md) の文言と `store-assets/` の画像を使う。プライバシーポリシーは `https://harie.studio/privacy/`。
5. 権限や外部に送るデータを変えたときは、`STORE.md` とプライバシーポリシー（`apps/site/src/privacy/`・`apps/site/src/en/privacy/`）を同じ PR で直し、理由を書く。

掲載用の画像は `pnpm --filter @harie/extension store-assets` で撮り直せる（配布用ビルドのエディタを、架空の SaaS「Tasklane」の見本で撮る）。

公開したら、Web 版の連携の案内（`apps/web/src/Guide.tsx`、FR-CAP-07）、LP の「ストア公開準備中」、この README の「インストール」をストアからの入れ方に直す。

## 関連する文書

- 構成と権限: [docs/03-design/integrations.md](../../docs/03-design/integrations.md) 1 章
- 開発時の決まり: [CLAUDE.md](CLAUDE.md)
