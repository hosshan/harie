# ADR-0016: JPEG / PNG 以外の画像は、取り込むときに一度だけ PNG / JPEG に変換してベース画像にする

- ステータス: 提案中（PR のマージで承認）
- 日付: 2026-11-12
- 決定者: Shun
- 関連: FR-FILE-15, FR-FILE-04, FR-EDIT-10, [ADR-0004](./0004-image-container-format.md), [ADR-0005](./0005-rendering-pipeline.md)

## 背景

SVG（図・アイコン）、WebP（Web からの保存）、GIF、HEIC（iPhone の写真）など、JPEG / PNG 以外の画像にも注釈を付けたい（Shun、2026-11-12）。保存形式は JPEG / PNG のままでよい。

Harie ファイルは「描画した画像 + 埋め込みのベース画像」で、ベース画像は読み込んだバイト列のまま埋め込み、再エンコードしない（ADR-0004）。描画エンジン（resvg）がベース画像として読めるのは JPEG / PNG（と GIF）で、ファイル形式仕様の `BaseMediaType` も `image/jpeg` / `image/png` だけである。

ブラウザは SVG・WebP・GIF・AVIF・BMP を読めるが、HEIC は Safari しか読めない。Node（MCP・CLI）にはブラウザの画像デコーダがない。

## 選択肢

### A. 取り込むときに一度だけ PNG / JPEG に変換し、以後はそれをベース画像として扱う

- 長所: ファイル形式（`BaseMediaType`）・描画・保存・差し替え・マスクを変えずに済む。古い版の Harie でも開ける。変換後は ADR-0004 のとおり再エンコードしない。
- 短所: 元のファイル（SVG のベクター情報、HEIC の元データ）は Harie ファイルに残らない。JPEG にする形式は一度だけ劣化する。

### B. 元の形式のまま埋め込み、描画のたびにデコードする

- 長所: 元のデータを失わない。
- 短所: `BaseMediaType` を広げる形式変更になり、古い版で開けない。描画エンジンが HEIC・WebP を読めないため、環境ごとにデコーダを持ち込む必要があり、ブラウザと Node で結果が一致しなくなる（ADR-0005）。

## 決定

**A を採用する。**

- 判定は中身で行う（`sniffImageType`、`packages/format`）。拡張子・MIME タイプは信用しない。
- 変換は `Renderer.importImage`（`packages/render`）で行う。SVG と GIF（最初のコマ）は resvg で描く。それ以外は呼び出し側が渡すデコーダで RGBA にしてから描き直す。ブラウザは画像デコーダ（`createImageBitmap`）、Node は WASM のデコーダ（WebP は `@jsquash/webp`、HEIC は `libheif-js`）を使う。Chrome など HEIC を読めないブラウザでも `libheif-js` で読む。
- 変換後の形式: 写真向けの HEIC・AVIF は JPEG（品質 92）、それ以外は PNG。透過部分は白地に合成する（保存時の描画と同じ見た目）。
- SVG は長辺 1024px 未満なら 1024px まで拡大して描く。どの形式も 1 辺 8192px を超えるものは取り込まない（SVG は縮める）。SVG の外部参照（URL・ファイル）は読まない。
- 変換した画像は Harie ファイルではないので、開いたファイルへ上書き保存しない（名前を `<名前>.harie.<拡張子>` にして保存する。ADR-0006）。
- 対応範囲: Web・Chrome 拡張・デスクトップ・PWA は SVG・WebP・GIF・BMP・AVIF・HEIC。MCP・CLI・Skill は SVG・WebP・GIF・HEIC（AVIF・BMP は Node でデコードできない）。

### HEIC のデコーダ

HEIC を読める JavaScript のライブラリはどれも libheif（LGPL-3.0）と libde265（LGPL-3.0）を使う。`libheif-js`（libheif の Emscripten ビルドをそのまま配布）を、改変せずに別のチャンクとして、HEIC を開いたときだけ読み込む（Web で約 2MB、gzip で約 0.7MB。PWA の事前キャッシュには入れない）。Harie 本体（MIT）と結合しないので、LGPL の条件（ライブラリの差し替えができること）を満たす。HEVC の特許は、デコーダを配布する側の課題として残る（下記）。

## 結果（影響）

- 良くなること: SVG の図・Web から保存した WebP・iPhone の HEIC にもそのまま注釈を付けられる。ファイル形式は変わらない。
- 受け入れるコスト: 元の SVG / HEIC は Harie ファイルに残らない（元のファイルは利用者の手元に残る）。`libheif-js` で Web の配布物が約 2MB、`@harie/mcp` のインストールが約 10MB 増える。
- 後でやること / 再評価の条件:
  - HEVC の特許について問題が指摘されたら、HEIC の WASM デコーダを外し、ブラウザが読める環境（Safari）だけに絞る。
  - Node で AVIF・BMP が要るようになったら、AV1 デコーダ入りの WASM を検討する。
