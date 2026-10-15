# apps/desktop

デスクトップ版（Tauri 2）。使い方と構成は [README.md](./README.md)、保存の決まりは [architecture.md 5 章](../../docs/03-design/architecture.md)。

- 画面は `@harie/web` の `Workspace` をそのまま使う。編集・描画・保存ファイルの組み立てをここで書き直さない（ADR-0002, ADR-0005）。ここに置くのは「どこから開くか・どこに書くか」だけ。
- ファイルの読み書きは `src-tauri/src/lib.rs` のコマンドだけで行う。fs プラグインや、任意のパスを読み書きできるコマンドを足さない。読み書きできるのは JPEG / PNG だけ。
- 画像のバイト列は JSON にせず、`invoke` の本文で送る。パスは日本語を含むので `Harie-Path` ヘッダーに URL エンコードして渡す。
- ベース画像は読み込んだバイト列のまま（ADR-0004）。`read_image` は中身に手を加えない。
- 権限は `src-tauri/capabilities/default.json` で必要なものだけ許す。CSP は `src-tauri/tauri.conf.json`（WASM のために `wasm-unsafe-eval`、AI の BYOK のために `api.anthropic.com`）。
- Rust を変えたら `cargo test`（`src-tauri/`）を通す。`Cargo.lock` はコミットする。
