# @harie/format

Harie ファイルの読み書き。描画済みの JPEG / PNG に、注釈ドキュメントと元のベース画像を埋め込む（JPEG は XMP + JUMBF（APP11）、PNG は XMP + `haRi` チャンク）。埋め込んだあとも普通の画像として表示できる。

- ベース画像のバイト列は再エンコード・加工せず、そのまま埋め込む（ADR-0004, FR-FILE-04）。
- `readHarie` はどんな入力でも例外を投げず、状態を `ReadResult` で返す（NFR-DATA-03）。
- DOM・Node 固有 API を使わない（テスト補助の `src/test-utils/` を除く）。

## 主な API

| 名前 | 内容 |
|---|---|
| `writeHarie({ rendered, base, doc })` | 描画済み画像（`@harie/render` の出力）に、ドキュメントとベース画像を埋め込んだバイト列を返す |
| `readHarie(bytes)` | ファイルを読む。`kind` は `harie`（ドキュメントとベース画像を返す）/ `plain`（普通の画像）/ `harie-mismatch`（画像が別のツールで編集された・ペイロードが壊れているなど）/ `corrupted` / `unsupported` |
| `detectFormat` / `readImageSize` | JPEG / PNG の判定と、画像の大きさの読み取り |
| `FORMAT_VERSION` | 形式のバージョン（現在 `0.1`） |

```ts
import { readHarie, writeHarie } from "@harie/format";

const result = readHarie(bytes);
if (result.kind === "harie") {
  // result.doc を編集し、@harie/render で描き直してから保存する
  const saved = writeHarie({ rendered, base: result.base.bytes, doc: result.doc });
}
```

## ゴールデンファイル

`fixtures/v0.1/` は形式の互換性を確かめるためのゴールデンファイル。再生成しない。形式を変えるときは `FORMAT_VERSION` と仕様書を更新し、`fixtures/v<新バージョン>/` を追加する。

## 関連する文書

- 形式の仕様: [docs/03-design/harie-format-spec.md](../../docs/03-design/harie-format-spec.md)
- [ADR-0004: 画像保存形式](../../docs/adr/0004-image-container-format.md)（ベース画像を再エンコードしない理由を含む）
