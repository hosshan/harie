# ADR-0002: アプリ基盤に TypeScript Web コア + Tauri 2 を採用する

- ステータス: 提案中
- 日付: 2026-10-07
- 決定者: Shun（承認待ち）
- 関連: [技術調査: アプリ基盤](../02-research/app-platform.md) / NFR-PLAT-01〜05 / [ADR-0003](./0003-monorepo-tooling.md) / [ADR-0005](./0005-rendering-pipeline.md)

## 背景

Anoi は Web・デスクトップ・アプリ・Chrome 拡張・MCP サーバーで提供したい（要求 R4〜R6）。基盤の選択はコード共有の範囲・開発速度・描画の一致（NFR-PLAT-05）を左右し、後から変えるコストが最も高い。

調査で、次の制約が先に決まることがわかった（詳細は調査文書）。

- Chrome 拡張は JS/TS が必須。
- MCP サーバーは TypeScript SDK が最も成熟。
- MCP サーバーでも再レンダリングが必要なため、描画ロジックは UI のない Node でも動く必要がある。

## 選択肢

### A. TypeScript Web コア + Tauri 2（デスクトップ・モバイル）

- 長所: 形式・モデル・描画・エディタ UI を 1 つの言語で書き、5 つの提供形態すべてで共有できる。Tauri は軽量（OS の WebView を使う）で、ファイル関連付け等の OS 統合ができる。iOS/Android にも対応済み。
- 短所: Tauri のモバイル対応は Flutter / React Native より若い。OS ごとに WebView が異なり（WebKit / WebView2）、表示差の確認が要る。Rust を少し書く場面がある。

### B. Flutter

- 長所: モバイルとデスクトップの UI 品質・成熟度が高い。
- 短所: Chrome 拡張と MCP は結局 TS で書くため、形式と描画を Dart と TS で二重実装になる。Flutter Web は初回ロードが重く、拡張に載せる手間も大きい。

### C. TypeScript Web コア + Electron

- 長所: デスクトップでの実績・情報量が最多。Chromium 同梱で表示差がない。
- 短所: 配布サイズとメモリが大きい。モバイルは別手段。

### D. TypeScript Web コア + React Native（モバイル）

- 長所: モバイルの成熟度が高い。
- 短所: エディタ UI（キャンバス操作）を Web と RN で二重実装になる。

### E. Web（PWA）のみ

- 長所: 最小構成。
- 短所: ローカルファイルの上書き・ファイル関連付けが Chrome 系以外で弱い。「アプリ」の要求を満たしにくい。

## 決定

**A. TypeScript Web コア + Tauri 2** を採用する。

決め手は「Chrome 拡張と MCP が TS である以上、コアを TS に寄せれば全形態でコードと描画が 1 本になる」こと。Anoi の主な利用場面は PC のブラウザであり、モバイルの成熟度より、拡張・MCP・Web との共有を優先する。

提供順序:

1. MVP: Web（PWA）+ Chrome 拡張 + ローカル MCP サーバー
2. Next: デスクトップ（Tauri 2, macOS / Windows）
3. Later: モバイル（Tauri 2 を第一候補、不足なら PWA で閲覧・簡易編集）

## 結果（影響）

- 良くなること: 言語が TS に統一され、AI エージェントでの開発効率が高い。描画が全環境で一致する。
- 受け入れるコスト: Tauri の WebView 差異の確認。モバイル品質は MVP 後に再評価が必要。
- 再評価の条件:
  - Tauri のデスクトップで致命的な問題（WebView 差異で描画・操作が成立しない等）が出たら Electron に切り替える。Web コアを共有している限り、殻の差し替えコストは小さい。
  - モバイルが主要な利用形態になったら、モバイルのみ別技術（Flutter / RN）を検討する。
