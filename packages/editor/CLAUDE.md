# packages/editor

エディタ UI（React）。Web・Chrome 拡張・デスクトップで共通に使う。ファイルの読み書きと描画エンジンの読み込みは呼び出し側（`apps/*`）が行う。

- 状態は `history.ts` の reducer に集約する。注釈の変更は必ず `packages/model` の `applyOps` を通し、1 回の操作（ドラッグ 1 回・文字の確定 1 回）を Undo の 1 単位にする。
- 表示は `buildSvg` の出力をそのまま使う（ADR-0005）。エディタ独自に注釈を描かない。選択枠・ハンドルだけを上の SVG に描く。
- 選択枠・当たり判定の範囲は `annotationBounds`（`packages/render`）を使い、描画と寸法をずらさない。
- 座標は画像のピクセル座標で扱う。画面上の大きさ（ハンドル・当たり判定の幅）は `screenPx` で換算する。
- ファイル API・`node:*` を使わない。
