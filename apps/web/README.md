# @harie/web

Harie の Web エディタ（Vite + React、PWA）。画像を開いて枠・矢印・説明文を付け、注釈を後から直せる JPEG / PNG として保存する。保存したファイルをもう一度開けば注釈を編集できる。

- 描画・保存はすべてブラウザの中で行う（WASM の描画エンジンとフォントを同梱）。画像はサーバーに送らない。
- PWA として一度開けば、オフラインでも開いて保存できる。
- AI の補足提案・個人情報の検出は、画面で自分の Claude API キーを入れると使える（BYOK。キーはブラウザの localStorage にだけ保存する）。
- 編集画面（`src/Workspace.tsx`）は Chrome 拡張のエディタページからも使う。

## インストール（使う人向け）

公開中の URL はまだない（下の「リリース」を参照）。手元で動かすときは「ローカルでの確認」の手順で起動する。ホストされた Harie を開いたら、ブラウザのアドレスバーの「インストール」からアプリとして追加できる（PWA）。

## ローカルでの確認

リポジトリの直下で実行する。Node 22 以上と pnpm 10 が要る。

```sh
pnpm install
pnpm --filter @harie/web dev        # http://localhost:5173/
```

- 画像を開く → 注釈を付ける → 保存 → 保存したファイルを開き直して注釈を直せることを確かめる。試しに使う画像は `packages/format/fixtures/`（`base.*` は普通の画像、`rendered.*` は Harie ファイル）にある。
- 本番と同じビルド（PWA・WASM の precache を含む）で確かめるときは次のとおり。

  ```sh
  pnpm --filter @harie/web build      # → apps/web/dist/
  pnpm --filter @harie/web preview
  ```

### テスト

```sh
pnpm test                            # ユニットテスト（リポジトリ全体）
pnpm --filter @harie/web e2e         # ビルドしたものをプレビューして Playwright で動かす
```

Playwright のブラウザが入っていない環境では `HARIE_CHROMIUM_PATH=/path/to/chromium` でブラウザを指定する。E2E では、ブラウザと Node で保存結果がバイト単位で一致することも確かめている（NFR-PLAT-05）。

## リリース

`main` に入ると [.github/workflows/pages.yml](../../.github/workflows/pages.yml) が LP（[apps/site](../site/README.md)）と一緒に GitHub Pages の `/harie/app/` へ公開する。ほかの静的ホスティングに置くときは次のとおり。

1. `main` で `pnpm check` と `pnpm e2e` が通っていることを確かめる。
2. `pnpm --filter @harie/web build` で `apps/web/dist/` を作る。サブパスに置くときは `HARIE_WEB_BASE=/path/` を付けてビルドする（`vite.config.ts` の `base`。manifest の `start_url` は相対なので合わせて変わる）。
3. `dist/` の中身を静的ホスティングに置く。HTTPS で配信する（PWA の Service Worker と File System Access API に必要）。
4. 公開後、一度開いてから再読み込みし、オフラインでも開けることを確かめる。更新は `registerType: "autoUpdate"` で、次に開いたときに反映される。

## 関連する文書

- 保存の決まり: [docs/03-design/architecture.md](../../docs/03-design/architecture.md) 5 章
- 開発時の決まり: [CLAUDE.md](CLAUDE.md)
- 全体のローカル手順: [docs/05-development/local-setup.md](../../docs/05-development/local-setup.md)
