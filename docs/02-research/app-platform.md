# 技術調査: アプリ基盤の選定

- ステータス: 調査完了（決定は [ADR-0002](../adr/0002-app-platform.md)）
- 調査日: 2026-10-07
- 注記: 各技術の成熟度は 2026 年中頃までの公開情報に基づく。着手時に最新リリースを再確認すること。

## 1. 問い

Web・デスクトップ・アプリ（モバイル）・Chrome 拡張・MCP サーバーのすべてで Harie を提供するとき、何を基盤にするとコードの共有と開発速度が最大になるか。

## 2. 前提として動かせない制約

調査の結果、候補比較の前に決まってしまう制約が 3 つある。

1. **Chrome 拡張は JavaScript / TypeScript で書く必要がある。** Manifest V3 の service worker・content script・popup は Web 技術のみ。他言語は WASM / Web ビルドとして載せることになる。
2. **MCP サーバーは TypeScript SDK が最も成熟している。** 公式 SDK は TypeScript と Python が先行し、仕様の更新もまずここに入る。Node で動かせば Claude Desktop / Claude Code / Cursor 等の各クライアントからそのまま使える。
3. **MCP サーバーでも注釈の再レンダリングが要る（FR-MCP-03）。** つまり「注釈 → ピクセル」の描画ロジックが、UI のない Node 環境でも動かなければならない。描画をフレームワークの UI 層に置くと MCP で再利用できない。

この 3 つから、**ファイル形式の読み書き・注釈モデル・描画は、Web と Node の両方で動く TypeScript（＋WASM）で書く**のが必然になる。残る論点は「エディタ UI とアプリの殻（シェル）を何で作るか」。

## 3. 候補

| 候補 | 概要 |
|---|---|
| A. TypeScript Web コア + Tauri 2 | エディタは React（Web）。デスクトップ・モバイルは Tauri 2 で同じ Web UI を包む |
| B. Flutter | エディタを Flutter で作り、Web / デスクトップ / モバイルを Flutter でビルド |
| C. TypeScript Web コア + Electron | A のデスクトップ部分を Electron にしたもの |
| D. TypeScript Web コア + React Native | Web と拡張は React、モバイルは React Native（UI は二重実装） |
| E. Web（PWA）のみ | ネイティブの殻を持たない |

## 4. 比較

評価: ◎ 非常に良い / ○ 良い / △ 課題あり / × 難しい

| 観点 | A: TS + Tauri 2 | B: Flutter | C: TS + Electron | D: TS + RN | E: PWA のみ |
|---|---|---|---|---|---|
| Web アプリ | ◎ そのまま | ○ Flutter Web。初回ロードが重い（CanvasKit 数 MB） | ◎ | ◎ | ◎ |
| Chrome 拡張 | ◎ エディタをそのまま拡張ページに同梱 | △ Flutter Web を拡張に載せるのは可能だが、CSP 対応・サイズ・DOM 取得連携が別実装 | ◎ | ◎ | ◎ |
| MCP サーバー | ◎ コアを Node から import | △ Dart の MCP SDK はあるが、コア（描画・形式）を Dart と TS で二重実装になる | ◎ | ◎ | ◎ |
| デスクトップ | ○ 軽量（OS の WebView）。ファイル関連付け・ネイティブメニュー可 | ◎ | ◎ 成熟。ただし配布サイズ 100MB 級 | △ 別途必要 | △ ファイル関連付け・ローカルファイル上書きが弱い |
| モバイル | △ Tauri 2 は iOS/Android 対応済みだが、エコシステムは発展途上 | ◎ 最も成熟 | × | ◎ | ○ 閲覧中心なら可 |
| 描画の一致（NFR-PLAT-05） | ◎ 全環境で同じ描画コード（WASM） | △ Flutter 側と Node 側で描画が別物 | ◎ | △ RN 側で別描画 | ◎ |
| 画像処理ライブラリ | ◎ WASM（resvg, mozjpeg 等）と Rust を併用可 | ○ Dart のパッケージは少なめ。FFI で補う | ◎ | ○ | ◎ |
| AI 開発との相性 | ◎ TS/React は AI の学習データ・ツールが最も厚い | ○ | ◎ | ○ | ◎ |
| 1 人〜少人数での保守 | ◎ 言語 1 つ（+ 必要時に Rust 少量） | △ Dart + TS の 2 言語 | ○ | △ UI 二重 | ◎ |

## 5. 考察

- **Flutter の強みはモバイル**だが、Harie の主戦場（PdM が PC のブラウザで SaaS 画面をキャプチャしてガイドを作る）はデスクトップと Chrome 拡張。モバイルは「閲覧・軽微な修正」が中心と見込まれ、Flutter を選ぶ理由として弱い。
- Flutter を選ぶと、拡張・MCP のために TS 側にも形式・描画を実装することになり、**同じロジックの二重実装**が最大のリスク（描画差異・形式の互換バグ）になる。
- **Tauri 2 は「既存の Web アプリを殻で包む」用途に向く。** Web 版をそのまま使い、ファイルシステムアクセス・OS 統合（「このアプリで開く」、ファイル関連付け `.harie.jpg`）を足すだけで済む。Rust 側は最小限にとどめられる。
- Electron は確実だが、配布サイズとメモリが大きく、Tauri で困ったときの退避先として位置付けるのが妥当。Web コアを共有している限り、殻の差し替えは安い。
- モバイルで Tauri 2 が不十分だった場合でも、閲覧・簡易編集なら PWA で代替できる。モバイル判断は MVP 後に再評価する。

## 6. 結論（推奨）

**A. TypeScript Web コア + Tauri 2** を推奨する。

- コア（形式・モデル・描画）を TypeScript + WASM で 1 回だけ書き、Web / 拡張 / MCP / デスクトップ / モバイルで共有する。
- 提供順序は Web(PWA) + Chrome 拡張 + MCP → デスクトップ（Tauri）→ モバイル（Tauri 2 または PWA、MVP 後に判断）。

詳細と却下理由は [ADR-0002](../adr/0002-app-platform.md)。

## 7. 関連する技術選定（後続 ADR）

| 項目 | 推奨 | ADR |
|---|---|---|
| モノレポ・言語・ツール | pnpm workspaces + TypeScript strict + Biome + Vitest | [ADR-0003](../adr/0003-monorepo-tooling.md) |
| 描画方式 | 注釈 → SVG → resvg（WASM）でラスタライズ | [ADR-0005](../adr/0005-rendering-pipeline.md) |
| Chrome 拡張フレームワーク | WXT（Vite ベース、MV3） | [ADR-0003](../adr/0003-monorepo-tooling.md) |
