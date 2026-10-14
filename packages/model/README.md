# @harie/model

注釈ドキュメント（`HarieDocument`）のスキーマと操作。Harie のすべてのパッケージ・アプリがこの型を共有する。

- 依存は zod だけ。DOM・React・Node 固有 API を使わない。
- 外部入力（ファイルから読んだ JSON・MCP の引数・LLM の出力）は、ここのスキーマで検証してから使う。

## 主な API

| 名前 | 内容 |
|---|---|
| `DocumentSchema` / `HarieDocument` | 注釈ドキュメント全体（キャンバスの大きさ・注釈の配列・リビジョンなど） |
| `AnnotationSchema` / `Annotation` | 注釈 1 件。`rect` / `ellipse` / `arrow` / `text` / `callout` / `badge` / `spotlight` / `blur` |
| `PiiMaskSchema` / `PiiAppliedSchema` | 個人情報の加工範囲と、適用済みの記録（ADR-0007） |
| `createDocument` | 画像の大きさから空のドキュメントを作る |
| `applyOps` | 注釈の変更（`add` / `update` / `remove` / `reorder` / `renumber`）を適用する。結果は `Result` で返し、例外を投げない |
| `migrateDocument` | 読み込んだ JSON を検証し、現行の `SCHEMA_VERSION` にそろえる |
| `prepareForSave` / `recordPiiApplied` | 保存前の整理（未採用の AI 提案を除くなど）と、PII 加工の記録 |
| `buildFileName` / `parseFileName` / `renameForSave` | 保存ファイル名（`<名前>.harie.jpg` など）の組み立てと解釈 |

```ts
import { applyOps, createDocument } from "@harie/model";

const doc = createDocument({ width: 1280, height: 800, title: "メンバーの招待" });
const result = applyOps(doc, [
  { op: "add", annotation: { id: "rect-1", type: "rect", x: 100, y: 80, w: 200, h: 48 } },
]);
if (result.ok) console.log(result.value.annotations.length);
```

## 関連する文書

- ドキュメントモデル: [docs/03-design/document-model.md](../../docs/03-design/document-model.md)
- アーキテクチャ: [docs/03-design/architecture.md](../../docs/03-design/architecture.md)
