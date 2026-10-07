# fixtures

テスト用の画像。実在の個人情報を含めないこと。

| ファイル | 内容 | 作り方 |
|---|---|---|
| `base.jpg` / `base.png` | 64×40 のグラデーション（ベース画像） | ImageMagick `gradient:` |
| `rendered.jpg` / `rendered.png` | 上に赤枠を描いたもの（レンダリング画像） | ImageMagick `-draw` |
| `large-base.jpg` | 520×400 のノイズ画像。APP11 が複数セグメントに分割されることの確認用 | ImageMagick `plasma:` |
| `v0.1/sample.anoi.jpg` / `.png` | 形式 v0.1 のゴールデンファイル。**再生成しない**（後方互換テスト） | `writeAnoi` で生成 |
