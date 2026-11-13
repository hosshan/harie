---
name: harie
description: Harie でスクリーンショットに枠・番号・吹き出しの注釈を付け、普通の JPEG/PNG のまま再編集できるガイド画像を作る・直す。利用ガイド用の画像に説明を足したい、貼り付けた/アップロードした画面キャプチャに注釈を付けたい、既存の Harie 画像（.harie.png / .harie.jpg）の文言や位置を直したい、画面の個人情報を隠したい、画面が変わったので画像だけ差し替えたい、というときに使う。MCP（@harie/mcp）を設定できない claude.ai やクラウドのセッションでも動く。
---

# Harie

Harie の画像は普通の JPEG / PNG で、注釈（枠・番号・吹き出し）のデータを中に持ち、あとから何度でも直せる。
`scripts/harie.mjs` が npm の `@harie/mcp` を呼んで操作する（Node.js 22 以上と npm レジストリへの接続が要る。1 回 5〜10 秒）。
以下の `harie` は `node <このスキルのディレクトリ>/scripts/harie.mjs`。最初に `H="node <絶対パス>/scripts/harie.mjs"` と置くとよい。結果は JSON で出る。

## 手順

手数を少なくする。1 回のツール呼び出しで済むことは 1 回で済ませる（シェルのコマンドはつなげて 1 回の Bash で実行する）。

**新しく作るとき**（3 手が目安）

1. 元の画像を 1 回見て、説明する UI 要素と個人情報の位置（ピクセル）を読む。場所が分からなければ `harie find`（アップロード先と作業ディレクトリの画像を新しい順に。拡張子のないファイルも判定）。見つからなければ画像をファイルとして添付するよう利用者に頼む（画像を描き直したり作り直したりしない）。SVG・WebP・GIF・HEIC は取り込むときに PNG（HEIC は JPEG）に変換される。AVIF・BMP などは扱えない。
2. 1 回の Bash で plan を書いて `apply` する。取り込み・個人情報の加工・注釈がまとめて済み、描いた画像が `view` に書き出される。

   ```sh
   cat > plan.json <<'EOF'
   {"title":"通知設定の画面","format":"png","masks":[...],"ops":[...]}
   EOF
   harie apply <元の画像> --plan @plan.json --view v.png && rm plan.json
   ```

   元の画像は変わらず、Harie 画像は元画像と同じフォルダに `<名前>.harie.<拡張子>` で作られる（アップロード先の画像なら `/mnt/user-data/outputs`、なければカレントディレクトリ。`-o` で変えられる）。
3. `v.png` を見て確かめる。直すところがあれば、作った Harie 画像に対して `ops` だけの plan で `apply` し直す（`--rev` に結果の `revision`）。マスクの範囲を間違えたときは、作った画像を消して元の画像から `apply` し直す。

**既存の Harie 画像を直すとき**

1. `harie open <file>` で注釈の一覧（id・文言・位置）と `revision` を読む。
2. 文言を変える・消すだけなら、画像を見ずに `harie edit <file> --ops @ops.json --rev <n>` で保存して終わる。注釈を足す・動かすときは、ファイルを 1 回見て位置を決め、`harie apply <file> --plan @plan.json --rev <n> --view v.png` で保存して `v.png` で確かめる。

最後に、保存したファイル（`result.path`）を利用者に渡し、「Harie（https://harie.studio/app/ ）で開くと注釈をそのまま直せる」と添える。

## コマンド

```sh
harie apply <image|file> --plan @plan.json [--view v.png] [--rev <n>] [-o out]
                                                    # 取り込み・masks・ops を 1 回で（既存の Harie 画像への masks は --confirm も要る）
harie open <file>                                   # 注釈の一覧・canvas の大きさ・revision（画像は返さない）
harie preview <file> --ops @ops.json [--view a.png] # 保存せずに描き、画像のパスを "view" で返す
harie edit <file> --ops @ops.json --rev <n>         # 適用して上書き保存（画像は返さない。見たければ --view）
harie mask <file> --masks @masks.json [--confirm] [-o 別名]
harie replace-base <file> --with <新しい画像> --rev <n>
harie list [dir]
harie guide <file> --intent "説明したいこと"        # 手引きの全文（下の決まりの詳しい版）
```

`--plan` / `--ops` / `--masks` は JSON の文字列、`@ファイル`、`-`（標準入力）のどれか。長い JSON は Write でファイルに書いてから `@` で渡す。
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
- `style`（任意）: `stroke`, `strokeWidth`, `fill`, `color`, `fontSize`, `fontWeight`, `radius`, `opacity`, `head`（矢印の矢じり。`end`（既定）/ `start`（`from` 側）/ `both` / `none`（ただの線））, `dash`。目安は `fontSize` が画像の幅の 1.1% 前後、`strokeWidth` が 0.2% 前後。
- `rect` / `ellipse` / `text` / `callout` は `rotation`（度、時計回り。範囲の中心を軸に回し、`x, y, w, h` は回す前の値）で回せる。
- 保存する画像の大きさは `{"op":"setOutputSize","size":{"width":640,"height":400}}` で変える（`null` で元の大きさ）。ベース画像と座標はそのまま。Retina の画像を画面と同じ大きさで載せたいときなどに使う。
- 注釈の `blur` は外せるぼかし。個人情報には使わない。
- `{"op":"frame","frame":{"padding":32,"shadow":{"blur":24}}}` で、保存する画像のまわりに余白・影を付けられる（白いヘルプページで画像の境目が分かるようにする）。ほかに `background`（`#RRGGBB` か `transparent`。透過は PNG のときだけ）、`radius`（角丸）、`border`（`{"width":1}`。縁の線）。`"frame": null` で外す。注釈の座標は変わらず、返す画像には付かない。頼まれたときだけ付ける。

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

- 新しく作るときは plan の `masks` に入れる（元の画像は残るので、間違えても元から作り直せる）。既存の Harie 画像だけを加工するときは、`harie mask <file> --masks @masks.json` で加工後の見た目を確かめてから `--confirm` を付けて保存する。保存するとベース画像が書き換わり、元の情報はどこにも残らない。
- kind: name（人の氏名・ユーザー名）, email, phone, address（住所・郵便番号）, id（会員番号・カード番号・社員番号など個人を特定できる番号）, face（顔写真・アバターの顔）, other（その他の個人情報）
- method: 文字は `replace`（同じ種類のダミー値。例: 山田 花子 / hanako@example.com）か `fill`。`replacement` には画面の元の値と違う値を使う（元の氏名やメールを書き写さない）。ほかに `mosaic` / `blur`。rect は文字より少し広く取る。
- 会社名・製品名・ボタンの文言など、個人ではない情報は隠さない。example.com のメールなどダミーに見える値でも、個人情報の形をしていれば隠すか利用者に確かめる。

## 画面が変わったとき

`replace-base` は注釈を残したまま画像だけ差し替え、大きさが違えば注釈を比率で合わせる。結果の `previousPii` は前の画像で隠していた範囲なので、新しい画像でも `mask` し直す。ずれた注釈は `preview` で見て直す。

## うまくいかないとき

- `npx` が失敗する: npm レジストリに出られない。ネットワーク設定で `registry.npmjs.org` を許可してもらう。
- `MCP サーバーが終了しました`: 続くエラーを読む。Node.js が 22 未満のこともある。
- 手元でビルドした MCP を使う: `HARIE_MCP_COMMAND='["node","/path/to/apps/mcp/dist/index.mjs"]'`。保存先を固定する: `HARIE_OUT_DIR`。
