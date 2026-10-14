# @harie/editor

注釈エディタの UI（React）。Web・Chrome 拡張・デスクトップで同じものを使う。ファイルの読み書き・描画エンジンの読み込み・AI の呼び出しは呼び出し側（`apps/*`）が行い、このパッケージは画面と編集の状態だけを持つ。

- 状態は `editorReducer`（`src/history.ts`）に集約する。注釈の変更は `@harie/model` の `applyOps` を通し、1 回の操作（ドラッグ 1 回・文字の確定 1 回）を Undo の 1 単位にする。
- 注釈の表示は `@harie/render` の `buildSvg` の出力をそのまま使う（ADR-0005）。エディタが描くのは選択枠とハンドルだけ。
- 座標は画像のピクセル座標で扱う。
- ファイル API・Node 固有 API を使わない。

## 主な API

| 名前 | 内容 |
|---|---|
| `Editor` | エディタ本体（道具のパレット・キャンバス・右側の欄） |
| `useEditorState(doc)` | `Editor` に渡す `state` と `dispatch` を作る（Undo / Redo 付き） |
| `Canvas` / `hitTest` | キャンバスと注釈の当たり判定 |
| `MaskPanel` / `toPiiMasks` / `addDetectedMasks` | 個人情報のマスク範囲の下書きと、適用する範囲への変換 |
| `adoptSuggestionOps` / `rejectSuggestionOps` | AI の提案（`status: "suggested"`）の採用・却下 |
| `useObjectUrl` | ベース画像のバイト列から blob: URL を作る |
| `editor.css` | エディタのスタイル（`@harie/editor/editor.css`） |

```tsx
import { Editor, useEditorState, useObjectUrl } from "@harie/editor";
import "@harie/editor/editor.css";

function App({ doc, base }) {
  const [state, dispatch] = useEditorState(doc);
  const baseImageUrl = useObjectUrl(base.bytes, base.mediaType);
  return <Editor state={state} dispatch={dispatch} baseImageUrl={baseImageUrl} onApplyMasks={applyMasks} />;
}
```

`onApplyMasks` を渡すとマスクの道具が出る。呼び出し側が `@harie/render` の `applyMasks` で新しいベース画像を作り、`piiApplied` を dispatch する（ADR-0007）。

## 関連する文書

- 操作の決まり（道具のパレット・その場の文字編集・文字サイズ）: [docs/03-design/architecture.md](../../docs/03-design/architecture.md)
- 使っている例: [apps/web](../../apps/web)
