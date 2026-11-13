# @harie/render

注釈の描画。注釈ドキュメント → SVG → ピクセル（resvg-wasm）→ JPEG / PNG を行う、Harie で唯一の描画系統（ADR-0005）。エディタの表示も保存する画像も、ここの `buildSvg` から作るので見た目がずれない。

- 描画を環境ごとに分岐させない。WASM とフォントの読み込み方だけを呼び出し側（`createRenderer` の引数）で変える。
- 出力は決定的（同じ入力 → 同じバイト列）。フォントは渡された Noto Sans JP と、注釈にハングル・Noto Sans JP にない簡体字が現れたときだけ読み込む補助フォント（`fonts/`、ADR-0013）を使う。補助フォントは `scripts/subset-fonts.py` で作る。
- 個人情報の加工（`applyMasks`）はベース画像を不可逆に書き換える（ADR-0007）。`blur` 注釈は可逆なぼかしで、個人情報の加工には使わない。
- DOM・Node 固有 API を使わない（テスト補助の `src/test-utils/` を除く）。

## 主な API

| 名前 | 内容 |
|---|---|
| `buildSvg(doc, options)` | 注釈を SVG 文字列にする純粋関数。エディタはこれをそのまま表示する |
| `annotationBounds` | 注釈の描画範囲。回した注釈は回したあとの形を囲む縦横の四角（ADR-0015）。範囲選択・当たり判定・番号や吹き出しの配置に使う |
| `annotationBox` / `rotatePoint` / `boxCenter` | 回す前の範囲と、その中心を軸にした点の回転。回した注釈のつまみや変形に使う |
| `createRenderer({ resvgWasm, jpegEncoderWasm, fonts, loadExtraFont? })` | 描画エンジンを作る。`loadExtraFont` は補助フォント（`EXTRA_FONT_FILES`）のバイト列を返す |
| `requiredExtraFonts(text)` | テキストを描くのに要る補助フォント |
| `renderer.render({ doc, base, output, atOutputSize? })` | 保存用の画像（`@harie/format` で埋め込む前のもの）を返す。`canvas.output` があればその大きさで描く（FR-EDIT-24）。`atOutputSize: false` でベース画像の大きさ |
| `renderer.renderPixels` | RGBA ピクセルを返す（テスト・プレビュー用） |
| `renderer.applyMasks({ base, width, height, masks })` | 個人情報のマスク（塗りつぶし・モザイク・ぼかし・ダミー置換）をベース画像に焼き込む |
| `THEMES` | 色・線幅などの見た目のテーマ |

```ts
import { createRenderer } from "@harie/render";

const renderer = await createRenderer({ resvgWasm, jpegEncoderWasm, fonts: [regular, bold] });
const rendered = await renderer.render({ doc, base: { bytes, mediaType: "image/png" }, output: "jpeg" });
```

## テスト

見た目を変える変更は `src/__snapshots__/` の SVG スナップショットに差分が出る。差分を PR で確認できるようにする。

## 関連する文書

- [ADR-0005: 描画パイプライン](../../docs/adr/0005-rendering-pipeline.md)
- [ADR-0007: PII 加工はベース画像に不可逆に適用する](../../docs/adr/0007-pii-masking.md)
- 性能の計測: [docs/02-research/rendering-performance.md](../../docs/02-research/rendering-performance.md)
