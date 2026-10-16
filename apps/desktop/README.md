# apps/desktop

Harie のデスクトップ版（Tauri 2、macOS / Windows。NFR-PLAT-03）。画面は Web エディタと同じ部品（`@harie/web` の `Workspace`）で、ファイルを OS のダイアログで開き、Harie ファイルはそのまま上書き保存する。保存の決まりは [architecture.md 5 章](../../docs/03-design/architecture.md#5-保存先とファイル-io)。

## 準備

- Node 22 / pnpm 10（リポジトリ共通）
- Rust（stable）
- macOS: Xcode Command Line Tools
- Windows: Microsoft C++ Build Tools と WebView2（Windows 11 は入っている）
- Linux（開発・確認用）: `libwebkit2gtk-4.1-dev` `libgtk-3-dev` `librsvg2-dev` など（[Tauri の前提](https://v2.tauri.app/start/prerequisites/)）

## 動かす

```sh
pnpm --filter @harie/desktop app:dev     # 画面は Vite（http://localhost:1420）から読み込む
pnpm --filter @harie/desktop app:build   # 配布物: src-tauri/target/release/bundle/
```

`pnpm --filter @harie/desktop build` は画面（`dist/`）だけを作る。リポジトリ全体の `pnpm build` から呼ばれるので、Rust は要らない。

## 確かめること

1. 「画像を開く」で普通の PNG / JPEG を開き、枠を描いて「保存」→ 同じフォルダーを既定にした保存ダイアログが出て、`名前.harie.png` で保存される。元の画像は残る。
2. 続けて注釈を足して「保存」→ ダイアログなしで同じファイルに上書きされる（`pnpm harie inspect` で revision が上がる）。
3. 保存形式を JPEG に変えて保存 → 上書きせず、保存ダイアログが出る。
4. Harie ファイルをウィンドウにドラッグ＆ドロップして開き、注釈を直して上書き保存できる。
5. 日本語を含むフォルダー・ファイル名でも開ける・保存できる。

## 構成

| 場所 | 内容 |
|---|---|
| `src/App.tsx` | 開く（ダイアログ・D&D・貼り付け）と保存先の決定 |
| `src/native.ts` | ダイアログと、Rust のコマンドの呼び出し |
| `src/paths.ts` | パスの扱い（macOS / Windows の区切り） |
| `src-tauri/src/lib.rs` | `read_image` / `write_image`。JPEG / PNG だけを読み書きし、上書きは一時ファイルから置き換える |
| `src-tauri/capabilities/default.json` | 画面に許す権限（ダイアログと題名の変更だけ。fs プラグインは使わない） |
| `src-tauri/icons/` | アイコン。元は `docs/brand`（`pnpm brand:icons` で `app-icon.png` を作り、`pnpm --filter @harie/desktop tauri icon src-tauri/icons/app-icon.png` で各 OS 向けを作る） |

## テスト

```sh
pnpm exec vitest run --project desktop    # パスの扱い（pnpm check にも含まれる）
cd apps/desktop/src-tauri && cargo test   # 拡張子の制限と上書き
```

画面を通した確認は、Linux なら Xvfb・`tauri-driver`（WebDriver）・`xdotool`（OS のダイアログの操作）で行える。CI ではまだ動かしていない。

## まだないもの（M6 の残り）

ファイル関連付け、ウィンドウを閉じる前の未保存の確認、署名・公証、自動更新、配布。
