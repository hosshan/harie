# packages/render

注釈ドキュメント → SVG → ピクセル → JPEG / PNG（ADR-0005）。性能の計測値は [docs/02-research/rendering-performance.md](../../docs/02-research/rendering-performance.md)。

- `buildSvg` は純粋関数。エディタの表示と保存の両方がこれを使う。見た目を変える変更はスナップショット（`src/__snapshots__/`）の差分を PR で確認できるようにする。
- 描画を環境ごとに分岐させない（ADR-0005）。WASM・フォントの読み込み方だけを呼び出し側（`createRenderer` の引数）で変える。
- 出力は決定的であること（同じ入力 → 同じバイト列）。乱数・時刻・環境依存のフォントを使わない。フォントは渡されたものだけを使う。
- PII の加工はここではなくベース画像の書き換えで行う（ADR-0007）。`blur` 注釈は可逆なぼかしで、PII 用ではない。
- テスト以外で `node:*` を import しない。Node で WASM とフォントを読む補助は `src/test-utils/` にある。
