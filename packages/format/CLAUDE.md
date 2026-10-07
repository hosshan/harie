# packages/format

Anoi ファイル（JPEG / PNG + XMP + JUMBF）の読み書き。仕様は [docs/03-design/anoi-format-spec.md](../../docs/03-design/anoi-format-spec.md)。

- ベース画像のバイト列は絶対に再エンコード・加工しない（ADR-0004, FR-FILE-04）。
- `readAnoi` はどんな入力でも例外を投げない。新しい失敗パターンは `ReadResult` の状態として返す（NFR-DATA-03）。
- 形式を変えるときは `FORMAT_VERSION` と仕様書を更新し、`fixtures/v<新バージョン>/` にゴールデンファイルを追加する。既存の `fixtures/v0.1/` は再生成しない。
- テスト以外で `node:*` を import しない（lint で禁止）。Node の API が要るテスト補助は `src/test-utils/` に置く。
