---
name: harie
description: Harie でスクリーンショットに枠・番号・吹き出しの注釈を付け、普通の JPEG/PNG のまま再編集できるガイド画像を作る・直す。利用ガイド用の画像に説明を足したい、貼り付けた/アップロードした画面キャプチャに注釈を付けたい、既存の Harie 画像（.harie.png / .harie.jpg）の文言や位置を直したい、画面の個人情報を隠したい、画面が変わったので画像だけ差し替えたい、というときに使う。MCP（@harie/mcp）を設定できない claude.ai やクラウドのセッションでも動く。
---

# Harie

Harie の画像は、見た目は普通の JPEG / PNG で、注釈（枠・番号・吹き出し）のデータを中に持っている。注釈はあとから何度でも直せる。
このスキルは `scripts/harie.mjs` から npm の `@harie/mcp` を 1 回ずつ起動して操作する。描画も保存も MCP 版と同じ。

- 必要なもの: Node.js 22 以上と、npm レジストリへの接続（初回だけ `npx` がパッケージを取ってくる。1 回 5〜10 秒）。
- 以下の `harie` は `node <このスキルのディレクトリ>/scripts/harie.mjs` のこと。結果は JSON で標準出力に出る。

## 1. 画像を受け取る

チャットに直接貼り付けた画像は、ファイルとして残っていないことがある。まず探す。

```sh
harie find                 # アップロード先・作業ディレクトリの画像を新しい順に（拡張子のないファイルも判定）
harie find /path/to/dir    # 場所が分かっていればそこを探す
```

- 見つかった画像の `harie: true` は、すでに注釈データを持つ Harie 画像。`import` せずに `open` する。
- 見つからなければ、利用者に「画像をファイルとして添付（アップロード）してください」と頼む。貼り付けた画像を見て描き直したり、自分で画像を作り直したりしない（ベース画像は元のバイト列のまま使う）。
- WebP / HEIC / GIF は扱えない。PNG で保存し直してもらう。

普通の画像は `import` で Harie 画像にする。元の画像は変えない。

```sh
harie import <画像> [--title "通知設定の画面"] [--format png|jpeg] [-o 保存先]
```

保存先を省略すると、`/mnt/user-data/outputs`（claude.ai でダウンロードできる場所）があればそこ、なければカレントディレクトリに `<名前>.harie.<拡張子>` で作る。環境変数 `HARIE_OUT_DIR` でも変えられる。文字の多い画面は `--format png` がきれい。

## 2. 何をどう補足するかを決める

注釈を新しく考えるときは、最初に一度だけ手引きを読む。強調する対象の選び方、文言の書き方、配置の決まりが書いてある。

```sh
harie guide <ファイル> --intent "通知の設定の変え方"
```

手引きは MCP のツール名で書かれている。このスキルでは次のように読み替える。

| 手引きの表記 | このスキル |
|---|---|
| `harie_open` | `harie open <file>` |
| `harie_create` | `harie import <image>` |
| `harie_preview` | `harie preview <file> --ops ...` |
| `harie_edit` | `harie edit <file> --ops ... --rev <revision>` |
| `harie_mask` / `confirm: true` | `harie mask <file> --masks ...` / `--confirm` |
| `harie_replace_base` | `harie replace-base <file> --with <新しい画像>` |

## 3. 編集する

```sh
harie open <file>                                  # 注釈の一覧・canvas の大きさ・revision（JSON）
harie preview <file> --ops '<json>' [--view a.png] # 保存せずに描いた画像を書き出す（パスを "view" で返す）
harie edit <file> --ops '<json>' --rev <n>         # 適用して上書き保存
harie edit <file> --ops @ops.json --rev <n>        # 長い ops はファイルで。- なら標準入力
```

ops の例（座標はベース画像のピクセル、左上が原点）:

```json
[
  {"op":"add","annotation":{"id":"r1","type":"rect","x":40,"y":40,"w":200,"h":80}},
  {"op":"add","annotation":{"id":"b1","type":"badge","x":0,"y":0,"number":1,"anchor":{"annotationId":"r1"}}},
  {"op":"add","annotation":{"id":"c1","type":"callout","x":300,"y":60,"w":240,"text":"ここで通知を設定します","anchor":{"annotationId":"r1","side":"left"}}},
  {"op":"update","id":"c1","patch":{"text":"通知の頻度を選びます"}},
  {"op":"remove","id":"b1"}
]
```

- 注釈の type: `rect` / `ellipse` / `arrow`(from, to) / `text`(x, y, text) / `callout`(x, y, w, text, anchor?) / `badge`(x, y, number, anchor?) / `spotlight` / `blur`。
- `badge` に `anchor` を付けると枠の左上の外側に自動で置かれる（x, y は 0 でよい）。`callout` に `anchor` を付けると枠への矢印が描かれる。
- `style`（任意）: `stroke`, `strokeWidth`, `fill`, `color`, `fontSize`, `fontWeight`, `radius`, `opacity`, `head`, `dash`。
- 注釈の `blur` は外せるぼかしで、個人情報には使わない（次の `mask` を使う）。
- `--rev` には `open` で得た `revision` を渡す。別の誰かが先に保存していたら失敗するので、`open` し直す。

## 4. 個人情報を隠す（元に戻せない）

```sh
harie mask <file> --masks '[{"kind":"name","method":"replace","replacement":"山田 花子","rect":{"x":10,"y":10,"w":120,"h":24}}]'
harie mask <file> --masks '<同じ json>' --confirm [-o 別名で保存]
```

- `--confirm` なしは保存せず、加工後の画像を `view` に書き出すだけ。範囲を確かめてから `--confirm` を付ける。
- `kind`: `name` / `email` / `phone` / `address` / `id` / `face` / `other`。`method`: `replace`（同じ種類のダミー値）/ `fill` / `mosaic` / `blur`。文字は `replace` か `fill`。
- 保存するとベース画像そのものが書き換わり、元の情報はファイルのどこにも残らない。利用者が残したい原本があるなら `-o` で別名にする。

## 5. 画面が変わったとき

```sh
harie replace-base <file> --with <新しいスクリーンショット> --rev <n>
```

注釈を残したまま画像だけ差し替える。大きさが違えば注釈を比率で合わせる。結果に `previousPii` があれば、前の画像で隠していた範囲なので、新しい画像でも `mask` し直す。

## 画像を見る回数を減らす

画像はコンテキストを大きく使う。必要なときだけ見る。

- `open` と `edit` は画像を返さない。文言を読む・直すだけなら JSON で足りる。
- 位置や重なりを確かめたいときだけ、`preview` / `mask` が書き出した `view` の画像か、保存したファイルそのものを開いて見る。
- 最初に画面の内容を把握するときは、元の画像を 1 回見る。そのあとは `preview` で確認したい変更をまとめてから 1 回見る。

## 仕上げ

保存したファイル（`result.path`）を利用者に渡す。claude.ai なら `/mnt/user-data/outputs` に置いたファイルがダウンロードできる。プロジェクトのスレッドなら共有フォルダに置いて添付する。
渡すときに「Harie（https://harie.studio/app/ ）で開くと注釈をそのまま直せる」と一言添える。

## うまくいかないとき

- `npx` が失敗する: npm レジストリに出られない環境。ネットワーク設定で `registry.npmjs.org` を許可してもらう。
- `MCP サーバーが終了しました`: 後ろに出ているサーバーのエラーを読む。Node.js のバージョンが 22 未満のこともある。
- 手元でビルドした MCP を使う: `HARIE_MCP_COMMAND='["node","/path/to/harie/apps/mcp/dist/index.mjs"]'`。
- ツールを直接呼ぶ: `harie call harie_list '{"dir":"/path"}'`。
