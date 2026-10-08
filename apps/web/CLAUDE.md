# apps/web

Web エディタ（Vite + React）。画像を開く → `packages/editor` で編集 → 保存する。保存の決まりは [architecture.md 5 章](../../docs/03-design/architecture.md)。

- 描画エンジン（resvg-wasm・mozjpeg）とフォントは `src/browser-renderer.ts` で読み込む。描画の処理そのものは `packages/render` を使い、ここで分岐させない（ADR-0005）。
- 読み込みは `src/load.ts`、保存ファイルの組み立ては `src/save.ts`。ベース画像は読み込んだバイト列のまま埋め込む（ADR-0004）。
- E2E は `e2e/`（Playwright）。`pnpm e2e` でビルドしたものをプレビューして動かす。ローカルでは `HARIE_CHROMIUM_PATH` でブラウザを指定できる。
- ブラウザと Node の保存結果がバイト単位で一致することを E2E で確認している（NFR-PLAT-05）。描画や保存を変えたらこのテストを通す。
- PWA は `vite-plugin-pwa`（`vite.config.ts`）。ビルドに含まれる WASM・フォントも precache する。アイコンの元は `public/icon.svg`。
- 個人情報のマスクは `applyMasks` でベース画像を書き換え、`Opened.base` を差し替える。加工前のバイト列（`alternative` を含む）を残さない（ADR-0007）。
- AI（`src/ai/`）: 提案と個人情報の検出は利用者の API キー（BYOK、localStorage）で Claude API をブラウザから直接呼ぶ。送信先の表示と同意がないと送れない（NFR-SEC-01）。SDK を含む `run.ts` は使うときにだけ `import()` する。E2E は `page.route` で API を差し替える。
- 編集画面（`src/Workspace.tsx`）は Chrome 拡張のエディタページからも使う（`package.json` の `exports`）。保存先は `deliver` で呼び出し側が決める。Web 固有のこと（ファイルを開く・File System Access API）は `App.tsx` に置く。
