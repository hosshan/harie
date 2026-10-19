# packages/editor

エディタ UI（React）。Web・Chrome 拡張・デスクトップで共通に使う。ファイルの読み書きと描画エンジンの読み込みは呼び出し側（`apps/*`）が行う。

- 状態は `history.ts` の reducer に集約する。注釈の変更は必ず `packages/model` の `applyOps` を通し、1 回の操作（ドラッグ 1 回・文字の確定 1 回）を Undo の 1 単位にする。
- 表示は `buildSvg` の出力をそのまま使う（ADR-0005）。エディタ独自に注釈を描かない。選択枠・ハンドルだけを上の SVG に描く。
- 選択枠・当たり判定の範囲は `annotationBounds`（`packages/render`）を使い、描画と寸法をずらさない。
- 座標は画像のピクセル座標で扱う。画面上の大きさ（ハンドル・当たり判定の幅）は `screenPx` で換算する。
- 個人情報のマスク範囲（`masks.ts`）は注釈にしない。適用は呼び出し側の `onApplyMasks` が行い、記録は `piiApplied` で履歴中のドキュメントにも反映する（ADR-0007）。適用済みで保存前のマスクは `appliedMasks` で受け取り、選択の道具で選んで `onUnmask` で外せる（ADR-0009）。
- ファイル API・`node:*` を使わない。
- AI の提案（`status: "suggested"`）は点線の枠で区別して表示し、採用・却下は `suggestions.ts` の操作で行う（FR-AI-02）。保存時は未採用の提案を除く（`prepareForSave`）。
- ベース画像の blob: URL は `useObjectUrl`（`object-url.ts`）で作る。作成と破棄を同じ effect で行わないと、StrictMode（開発時）で使用中の URL が破棄されて画像が消える。
- 道具のパレット（`Palette.tsx`）・その場の文字編集（`TextEditor.tsx`）・文字サイズの決まりは `docs/03-design/architecture.md` の「エディタの操作の決まり」に従う。その場の文字編集も確定 1 回を Undo の 1 単位にする。
- 画面の文字は `src/i18n/messages.ts`（Web 側は `apps/web/src/messages.ts`）に日本語と英語を並べて置き、`useMessages` で読む。コンポーネントに文字を直接書かない（NFR-I18N-01）。英語は日本語と同じ形（`Messages` 型）にする。
