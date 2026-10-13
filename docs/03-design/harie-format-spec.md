# Harie ファイル形式仕様 v0.1（ドラフト）

- ステータス: ドラフト（実装開始時に v0.1 を確定。確定後の破壊的変更はメジャーバージョンを上げる）
- 最終更新: 2026-10-07
- 関連: [ADR-0004](../adr/0004-image-container-format.md) / [技術調査](../02-research/image-storage.md) / [注釈ドキュメントモデル](./document-model.md)

## 1. 概要

Harie ファイルは、次の 3 つを 1 つの画像ファイルに格納したもの。

1. **レンダリング画像**: ファイルのピクセルそのもの（注釈焼き込み済み）
2. **注釈ドキュメント**: JSON
3. **ベース画像**: 注釈を焼き込む前の画像（PII 加工済み）。元のエンコードのバイト列

Harie を知らないツールは 1 だけを表示し、2 と 3 を無視する。

## 2. 共通: ペイロード（JUMBF）

ISO/IEC 19566-5（JUMBF）の superbox を 2 つ使う。

| ラベル | 内容種別 | 中身 |
|---|---|---|
| `harie.document` | JSON（type UUID `6a736f6e-0011-0010-8000-00aa00389b71`） | 注釈ドキュメント（UTF-8 JSON） |
| `harie.base` | Embedded File（type UUID `40cb0c32-bb8a-489d-a70b-2ad6f47f4369`） | `bfdb` にメディアタイプ（`image/jpeg` / `image/png`）、`bidb` にベース画像のバイト列 |

- `jumd` の toggles は `0x03`（requestable + label）。
- 将来の追加ボックス（例: `harie.thumbnail`、`harie.history`）は、知らないラベルは無視する。

## 3. 共通: XMP 記述子

名前空間 `https://harie.app/ns/1.0/`（接頭辞 `harie`）。値はすべて属性で持つ。

| プロパティ | 型 | 説明 |
|---|---|---|
| `harie:formatVersion` | 文字列 | 本仕様のバージョン（`0.1`） |
| `harie:docId` | UUID | ドキュメントの永続 ID。複製しても変わらない |
| `harie:revision` | 整数 | 保存のたびに +1 |
| `harie:payloadSha256` | hex | `harie.document` と `harie.base` の superbox バイト列を、この順に連結した SHA-256 |
| `harie:renderSha256` | hex | レンダリング画像の圧縮データのハッシュ（JPEG: 最初の `SOS` から `EOI` まで。PNG: 全 `IDAT` の連結） |

XMP は他のメタデータ（`dc:` 等）と同じパケットに共存してよい。

## 4. JPEG

```
SOI
APP0 (JFIF)            … レンダリング画像のもの。あれば保持
APP1 (EXIF)            … 既定では書かない（位置情報等の漏れ防止）
APP1 (XMP)             … harie 記述子
APP2 (ICC)             … レンダリング画像のもの。あれば保持
APP11 (JUMBF, En=0xA001, Z=1..n)  … harie.document
APP11 (JUMBF, En=0xA002, Z=1..n)  … harie.base
DQT / SOF / DHT / SOS … EOI   … レンダリング画像の本体
```

- APP11 セグメントの構造は C2PA と同じ: `FFEB` `Le(2)` `CI="JP"(2)` `En(2)` `Z(4)` に続けて、superbox の `LBox`+`TBox`（8 バイト、各セグメントで繰り返す）と本体の断片。
- Box Instance 番号 `En` は C2PA マニフェストと衝突しないよう `0xA001` 以降を使う（C2PA 実装は通常小さい番号から使う）。読み込み側は `En` ではなくラベルで識別する。
- 1 セグメントの本体は最大 65,517 バイト（65,533 − ヘッダ 16）。

## 5. PNG

```
IHDR
iCCP / sRGB / ...      … あれば保持
iTXt "XML:com.adobe.xmp" … harie 記述子
haRi                   … JUMBF superbox: harie.document
haRi                   … JUMBF superbox: harie.base
IDAT ...
IEND
```

- `haRi` は補助（ancillary）・私用（private）・コピー安全（safe-to-copy）チャンク。中身は JUMBF superbox 1 つ（分割不要）。
- `IDAT` より前に置く（ストリーミング読み込みで早く見つけるため）。

## 6. 読み込み手順

1. 形式判定（マジックナンバー）。JPEG / PNG 以外は非対応として通常画像扱い。
2. XMP 記述子を探す。無ければ通常画像。
3. JUMBF ペイロードを集める（JPEG は `En` ごとに `Z` 順で連結）。パケットが欠けている・`LBox` と合わない superbox はその superbox だけ捨てる（ImageMagick は複数セグメントの APP11 のうち先頭だけを残すことがある）。ラベルの揃わない状態は `PayloadMissing`。
4. `harie.document` と `harie.base` が揃わなければ `PayloadMissing`。`payloadSha256` を検証し、不一致なら `PayloadCorrupted`。
5. `renderSha256` を検証。不一致 → `RenderedImageModified`（外部で再エンコード・編集された）。
6. `formatVersion` のメジャーが未知 → 読み取り専用で開くか、通常画像として開く。
7. 注釈ドキュメントをスキーマ検証し、マイグレーション。

いずれの失敗でも例外で落とさず、状態付きの結果を返す（NFR-DATA-03）。

実装: `packages/format/src/harie-file.ts` の `readHarie`。結果の型は次のとおり。

```ts
type ReadResult =
  | { kind: "plain"; format }                                  // Harie ファイルではない
  | { kind: "harie"; format; descriptor; doc; base }            // 正常
  | { kind: "harie-mismatch"; format; reason; descriptor; doc?; base? }
    // reason: PayloadMissing | PayloadCorrupted | RenderedImageModified | UnsupportedVersion | InvalidDocument
    // RenderedImageModified のときは doc と base を返し、ユーザーに「埋め込みから復元」か「今のピクセルを新しいベースにする」かを選ばせる
  | { kind: "unsupported" }                                    // JPEG / PNG 以外
  | { kind: "corrupted"; format; message };                    // 画像として構造が壊れている
```

## 7. 書き込み規則

- ベース画像は読み込んだバイト列をそのまま書く（再エンコード禁止）。PII 加工・ベース差し替え時のみ新しいバイト列になる。
- レンダリング画像（ファイル本体）とベース画像の形式は独立している。JPEG のベース画像を PNG のファイルに埋め込んでもよく、その逆もよい（保存形式は利用者が選ぶ。FR-FILE-02）。
- 書き込みごとに `revision` を +1 し、ハッシュを再計算する。
- EXIF は既定で書かない。ベース画像側の EXIF も、取り込み時に除去する（撮影位置・端末情報の漏れ防止）。

## 8. テスト用資産

`packages/format/fixtures/` に以下を置き、ゴールデンテストにしている（`v0.1/` は再生成しない）。

- 各バージョンの正常ファイル（後方互換テスト）
- ペイロード欠損・ハッシュ不一致・分割順序の乱れたファイル
- 外部ツール（ImageMagick / Pillow / sharp）で再保存したファイル
