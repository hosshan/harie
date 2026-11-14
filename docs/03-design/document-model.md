# 注釈ドキュメントモデル

- ステータス: ドラフト
- 最終更新: 2026-10-07
- 関連: [ファイル形式仕様](./harie-format-spec.md) / [アーキテクチャ](./architecture.md)

Harie ファイルに埋め込む注釈ドキュメント（JSON）の構造。正となる定義は実装時に `packages/model` の zod スキーマとし、そこから JSON Schema を生成して MCP のツール定義にも使う。本書はその設計意図を説明する。

## 1. 例

```json
{
  "schemaVersion": "0.1",
  "docId": "c8be77cd-bc6d-4747-bf15-12e345a4b522",
  "revision": 3,
  "meta": {
    "title": "通知設定の変更方法",
    "service": "tasklane",
    "source": { "kind": "chrome-extension", "url": "https://app.example.com/settings/notifications", "capturedAt": "2026-10-07T08:00:00Z" },
    "createdAt": "2026-10-07T08:00:00Z",
    "updatedAt": "2026-10-07T09:12:00Z"
  },
  "canvas": { "width": 2560, "height": 1600, "devicePixelRatio": 2, "crop": null },
  "theme": { "preset": "default" },
  "annotations": [
    { "id": "a1", "type": "rect", "x": 120, "y": 340, "w": 480, "h": 96,
      "style": { "stroke": "#E5484D", "strokeWidth": 6, "radius": 8 } },
    { "id": "a2", "type": "badge", "x": 96, "y": 316, "number": 1 },
    { "id": "a3", "type": "callout", "x": 640, "y": 360, "w": 420,
      "text": "「メール通知」をオンにすると、タスクの更新時にメールが届きます",
      "anchor": { "annotationId": "a1", "side": "right" } }
  ],
  "frame": { "padding": 64, "radius": 20, "shadow": { "blur": 48, "y": 12, "color": "#00000033" } },
  "pii": {
    "applied": [ { "kind": "email", "method": "replace", "rect": { "x": 1800, "y": 92, "w": 320, "h": 40 } } ]
  },
  "context": {
    "intent": "通知設定の変更方法を説明する",
    "dom": { "ref": "omitted" }
  }
}
```

## 2. 設計判断

| 項目 | 判断 | 理由 |
|---|---|---|
| 座標系 | ベース画像のピクセル座標（左上原点）。`devicePixelRatio` を別途記録 | 画面の CSS 座標と画像座標の変換を 1 か所に閉じ込める |
| 保存する画像の大きさ | `canvas.output`（`{ width, height }`、任意）。省略は表示範囲（`crop` か画像全体）と同じ。座標は変えず、保存・コピーする画像だけをこの大きさで描く | 元の画像を残したまま何度でも変えられる（FR-EDIT-24, [ADR-0018](../adr/0018-output-size.md)） |
| 注釈の順序 | 配列の順 = 描画順（後ろほど上） | 単純で、MCP からも理解しやすい |
| ID | ドキュメント内で一意な短い文字列 | MCP で「a3 のテキストを変えて」と指定しやすい |
| 番号バッジ | `number` を明示的に持つ。`renumber` 操作で振り直す | 自動採番だけにすると、削除時に意図しない番号変更が起きる |
| スタイル | 注釈ごとの上書き + `theme.preset` | プリセットを変えるだけで全体の色を揃えられる（FR-EDIT-08） |
| 提案中の注釈 | `"status": "suggested"` を付けて同じ配列に入れる | 採用はフラグを外すだけ。保存時は既定で `suggested` を除外 |
| PII | 加工の**記録**（種別・方法・範囲）のみ。元の値は持たない | 加工前の情報を残さない（[ADR-0007](../adr/0007-pii-masking.md)） |
| 仕上げ | `frame`（任意）に余白・背景・角丸・縁の線・影を px で持ち、保存時に画像の外側へ描く。注釈の座標は画像のまま | 保存後も直せる。古い版は知らないフィールドとして残し、仕上げなしで描く（[ADR-0017](../adr/0017-image-frame.md)） |
| DOM 情報 | 既定ではファイルに含めない（`context.dom` は参照のみ） | サイズとプライバシー。DOM には PII が含まれうる |
| 作成者 | 既定では記録しない | NFR-SEC-05 |

## 3. 注釈の種類（v0.1）

| type | 必須プロパティ | 備考 |
|---|---|---|
| `rect` | `x, y, w, h` | `style.radius`, `style.fill` 任意。線の太さ `style.strokeWidth`、線の種類 `style.dash`（`solid` / `dashed` / `dotted`。省略は実線）は楕円・矢印も同じ |
| `ellipse` | `x, y, w, h` | `style.strokeWidth`, `style.dash` |
| `arrow` | `from, to` | `style.head`（`end` / `start` / `both` / `none`。`start` は `from` 側、`end` は `to` 側に矢じりを付け、省略は `end`。`none` は矢じりのない線。`start` は ADR-0014 で追加し、それより前の版では読めない）。`style.dash` は線だけに効き、矢じりは塗りつぶしのまま |
| `text` | `x, y, text` | 枠なしラベル。`style.fontWeight`（`normal` / `bold`） |
| `callout` | `x, y, w, text` | 吹き出し。`anchor`（`annotationId`, `side`）で他の注釈に紐付けると、吹き出しから対象へ矢印を描く。矢印は実際の位置関係から決め（離れている向きの向かい合う辺どうしを結び、範囲が重なる向きでは重なりの中央でまっすぐ引く）、`side` は配置の目安。重なっている・対象が描かれないときは描かない |
| `badge` | `x, y, number` | 番号付き丸。`anchor`（`annotationId`）で枠などに紐付けると、描画時に紐付け先の左上の角の完全に外側へ置く（ADR-0011。既定の大きさで角から 40 ずらす。画像の外に出るときは左の辺、次に上の辺の外側）。`x, y` は紐付け先がないときの位置で、紐付けている場合も計算した位置を保存する。エディタで番号だけを動かすと紐付けを外す |
| `spotlight` | `x, y, w, h` | 範囲外を暗くする（Next） |
| `blur` | `x, y, w, h, method` | **可逆マスク**。PII 以外（見せたくないだけの UI）向け。PII には使わない。`method: mosaic` は SVG で表現できないため、描画では強めのぼかしで代替する |

`rect` / `ellipse` / `text` / `callout` は任意で `rotation`（度、時計回り）を持てる（FR-EDIT-21 / ADR-0015）。回転の軸は回す前の範囲（`annotationBox`）の中心で、`x, y, w, h` は回す前の値のまま持つ。省略・0 は回さない。ほかの種類（矢印は端点で向きを変える。番号は丸）は `rotation` を持っても無視する。範囲選択・重なりの判定・番号や吹き出しの配置は、回した形を囲む縦横の四角（`annotationBounds`）を使う。`rotation` はそれより前の版では無視され、回さずに描かれる（フィールドは保存しても残る）。

`blur` を注釈として持つと、ベース画像に元のピクセルが残る。PII の加工は注釈ではなく、ベース画像の書き換え（`pii.applied` に記録）で行う。エディタはこの違いを UI 上で明確に区別する。

PII 加工の指示は `PiiMask`（`kind`, `method`, `rect`, 任意で `replacement`・`color`）で表す。指示はドキュメントに保存せず、加工後に `pii.applied`（`kind`, `method`, `rect`）だけを残す。ダミー置換の文字列も残さない。

## 4. 操作（`packages/model` の API）

注釈の変更はすべて純粋関数の「操作」として表す。エディタの Undo/Redo、AI の提案、MCP のツールが同じ操作を使う。

```ts
type Op =
  | { op: "add"; annotation: Annotation; index?: number }
  | { op: "update"; id: string; patch: Partial<Annotation> }
  | { op: "remove"; id: string }
  | { op: "reorder"; id: string; index: number }
  | { op: "renumber" }
  | { op: "setOutputSize"; size: { width: number; height: number } | null }; // 保存する画像の大きさ（FR-EDIT-24）。null で元の大きさ
  | { op: "frame"; frame: Frame | null }; // 保存する画像の仕上げを置き換える。null で外す（FR-FILE-16）

function apply(doc: HarieDocument, ops: Op[]): HarieDocument; // 不正な操作は検証エラーを返す
```

## 5. マイグレーション

- `schemaVersion` ごとに `migrate_0_1_to_0_2(doc)` のような関数を `packages/model/migrations/` に置く。
- 読み込み時に最新まで順に適用する。保存は常に最新バージョン。
- 各マイグレーションには、旧バージョンのフィクスチャを入力にしたテストを必ず付ける。
