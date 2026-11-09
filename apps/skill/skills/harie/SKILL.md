---
name: harie
description: Harie でスクリーンショットに枠・番号・吹き出しの注釈を付け、普通の JPEG/PNG のまま再編集できるガイド画像を作る・直す。利用ガイド用の画像に説明を足したい、貼り付けた/アップロードした画面キャプチャに注釈を付けたい、既存の Harie 画像（.harie.png / .harie.jpg）の文言や位置を直したい、画面の個人情報を隠したい、画面が変わったので画像だけ差し替えたい、というときに使う。MCP（@harie/mcp）を設定できない claude.ai やクラウドのセッションでも動く。
---

# Harie

Harie の画像は普通の JPEG / PNG で、注釈（枠・番号・吹き出し）のデータを中に持ち、あとから何度でも直せる。
`scripts/harie.mjs` が npm の `@harie/mcp` を呼んで操作する（Node.js 22 以上と npm レジストリへの接続が要る。1 回 5〜10 秒）。
以下の `harie` は `node <このスキルのディレクトリ>/scripts/harie.mjs`。最初に `H="node <絶対パス>/scripts/harie.mjs"` と置くとよい。結果は JSON で出る。

## 手順

1. **画像を用意する**。場所が分からなければ `harie find`（アップロード先と作業ディレクトリの画像を新しい順に。拡張子のないファイルも判定）。`harie: true` の画像は Harie 画像なので 4 へ。見つからなければ、画像をファイルとして添付するよう利用者に頼む（画像を描き直したり作り直したりしない）。JPEG / PNG 以外は扱えない。
2. **Harie 画像にする**: `harie import <画像> [--title "通知設定の画面"] [--format png]`。元の画像は変えない。保存先は元画像と同じフォルダ（アップロード先の画像なら `/mnt/user-data/outputs`、なければカレントディレクトリ）で、`-o` で変えられる。
3. **画面を見る**: 元の画像を 1 回見て、説明する UI 要素の位置（ピクセル）を読む。
4. **個人情報があれば先に隠す**（元に戻せない。下の「個人情報」）。
5. **注釈を付ける**: 下の「注釈の決まり」に沿って ops を作り、`harie edit <file> --ops @ops.json --rev <revision> --view v.png` で保存と同時に描いた画像を書き出し、`v.png` を見て確かめる。崩れていれば直す ops で `edit` し直す（注釈はいつでも直せるので、保存前の `preview` は要らない）。
6. **渡す**: 保存したファイル（`result.path`）を利用者に渡し、「Harie（https://harie.studio/app/ ）で開くと注釈をそのまま直せる」と添える。

既存の Harie 画像を直すときは `harie open <file>` で注釈の一覧（id・文言・位置）と `revision` を読み、`update` / `add` / `remove` の ops で `edit` する。文言を変えるだけなら画像を見ない。注釈を足すときは、ファイルを 1 回見て位置を決め、`edit --view` の画像で確かめる。

## コマンド

```sh
harie open <file>                                   # 注釈の一覧・canvas の大きさ・revision（画像は返さない）
harie preview <file> --ops @ops.json [--view a.png] # 保存せずに描き、画像のパスを "view" で返す
harie edit <file> --ops @ops.json --rev <n>         # 適用して上書き保存（画像は返さない。見たければ --view）
harie mask <file> --masks @masks.json [--confirm] [-o 別名]
harie replace-base <file> --with <新しい画像> --rev <n>
harie list [dir]
harie guide <file> --intent "説明したいこと"        # 手引きの全文（下の決まりの詳しい版）
```

`--ops` / `--masks` は JSON の文字列、`@ファイル`、`-`（標準入力）のどれか。長い JSON は Write でファイルに書いてから `@` で渡す。
`--rev` は `open` / `edit` の結果の `revision`。食い違えば失敗するので `open` し直す。

## ops

座標はベース画像のピクセル（`canvas.width` × `canvas.height`）、左上が原点。Retina のスクリーンショットは画面の 2 倍。

```json
[
  {"op":"add","annotation":{"id":"r1","type":"rect","x":40,"y":40,"w":200,"h":80}},
  {"op":"add","annotation":{"id":"b1","type":"badge","x":0,"y":0,"number":1,"anchor":{"annotationId":"r1"}}},
  {"op":"add","annotation":{"id":"c1","type":"callout","x":300,"y":60,"w":240,"text":"ここで通知を設定します","anchor":{"annotationId":"r1","side":"left"}}},
  {"op":"update","id":"c1","patch":{"text":"通知の頻度を選びます"}},
  {"op":"remove","id":"b1"}
]
```

- type: `rect` / `ellipse` / `arrow`(from, to) / `text`(x, y, text) / `callout`(x, y, w, text, anchor?) / `badge`(x, y, number, anchor?) / `spotlight` / `blur`。
- `badge` の `anchor` で枠の左上の外側に自動で置かれる（x, y は 0 でよい）。`callout` の `anchor`（`side`: top / right / bottom / left）で枠への矢印が描かれる。`arrow` を別に引かない。
- `style`（任意）: `stroke`, `strokeWidth`, `fill`, `color`, `fontSize`, `fontWeight`, `radius`, `opacity`, `head`, `dash`。目安は `fontSize` が画像の幅の 1.1% 前後、`strokeWidth` が 0.2% 前後。
- 注釈の `blur` は外せるぼかし。個人情報には使わない。

## 注釈の決まり

<!-- guide:start -->
- 強調するのは、説明に必要な UI 要素（ボタン・入力欄・メニュー・タブ・設定項目など）だけにする。多くても 8 か所。操作の順に並べる。
- text は日本語で、1〜2 文、120 文字以内。「〇〇をクリックします」のように、読者がすることを具体的に書く。画面にない機能や値を作らない。
- 画面に写っている個人情報（氏名・メールアドレスなど）を説明文に書き写さない。
- 既に付いている注釈と同じ箇所・同じ内容は提案しない。
- 説明する箇所ごとに、枠・番号・吹き出しを組で置く。吹き出しは必ず矢印で枠を指す。
- 番号は枠の左上の角の外側に置き、すべての番号で同じ位置にそろえる。番号と吹き出しで UI 要素（強調しないものも含む）を隠さない。
- 番号は操作の手順にだけ付ける。手順ではない補足（ヘルプの案内など）は枠と吹き出しだけにする。
<!-- guide:end -->
- 吹き出しは UI を隠さない余白に置く。縦か横の範囲を枠と重ねると矢印がまっすぐになる。

## 個人情報

```json
[{"kind":"name","method":"replace","replacement":"山田 花子","rect":{"x":10,"y":10,"w":120,"h":24}}]
```

- まず `--confirm` なしで呼ぶと、保存せずに加工後の画像を `view` に書き出す。範囲を確かめてから同じ masks に `--confirm` を付けて保存する。保存するとベース画像が書き換わり、元の情報はどこにも残らない。原本を残すなら `-o` で別名にする。
- kind: name（人の氏名・ユーザー名）, email, phone, address（住所・郵便番号）, id（会員番号・カード番号・社員番号など個人を特定できる番号）, face（顔写真・アバターの顔）, other（その他の個人情報）
- method: 文字は `replace`（同じ種類のダミー値。例: 山田 花子 / hanako@example.com）か `fill`。`replacement` には画面の元の値と違う値を使う（元の氏名やメールを書き写さない）。ほかに `mosaic` / `blur`。rect は文字より少し広く取る。
- 会社名・製品名・ボタンの文言など、個人ではない情報は隠さない。example.com のメールなどダミーに見える値でも、個人情報の形をしていれば隠すか利用者に確かめる。

## 画面が変わったとき

`replace-base` は注釈を残したまま画像だけ差し替え、大きさが違えば注釈を比率で合わせる。結果の `previousPii` は前の画像で隠していた範囲なので、新しい画像でも `mask` し直す。ずれた注釈は `preview` で見て直す。

## うまくいかないとき

- `npx` が失敗する: npm レジストリに出られない。ネットワーク設定で `registry.npmjs.org` を許可してもらう。
- `MCP サーバーが終了しました`: 続くエラーを読む。Node.js が 22 未満のこともある。
- 手元でビルドした MCP を使う: `HARIE_MCP_COMMAND='["node","/path/to/apps/mcp/dist/index.mjs"]'`。保存先を固定する: `HARIE_OUT_DIR`。
