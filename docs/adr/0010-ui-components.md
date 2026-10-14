# ADR-0010: UI 部品に shadcn/ui（Tailwind CSS + Radix UI）を使う

- ステータス: 承認
- 日付: 2026-10-14
- 決定者: Shun（2026-10-14 のスレッドで「shadcn など CSS フレームワークが入っていなければ入れてください」と依頼）
- 関連: FR-FILE-01 / FR-FILE-02 / PR #25（保存形式の選択肢）

## 背景

Web エディタ（`apps/web`）と Chrome 拡張のエディタページは、手書きの CSS（`apps/web/src/styles.css`、`packages/editor/src/editor.css`）だけで作ってきた。PR #25 でヘッダーに保存形式のネイティブの `<select>` を足したところ、隣のボタンと高さ・見た目が揃わなかった。メニューやポップオーバーのように、開閉・キーボード操作・フォーカス管理を伴う部品を毎回自作すると、見た目とアクセシビリティの品質を揃えにくい。

## 選択肢

### A. shadcn/ui（Tailwind CSS + Radix UI）

- 部品のソースをリポジトリにコピーして使う。中身は Radix UI のプリミティブ（キーボード操作・ARIA・フォーカス管理）と Tailwind のクラス。
- 長所: 部品を自分たちで直せる。必要な部品だけを足せる。Radix の操作性をそのまま得られる。
- 短所: Tailwind のビルド（Vite プラグイン）が増える。既存の手書き CSS とクラスの書き方が 2 通りになる。

### B. 既製の部品ライブラリ（MUI、Mantine など）

- 長所: 部品が多い。
- 短所: 独自のテーマ機構とランタイムの CSS を持ち込み、既存の見た目と合わせにくい。バンドルが大きく、拡張の容量が増える。

### C. 今のまま手書きで作る

- 長所: 依存が増えない。
- 短所: メニューなどの操作性（Esc で閉じる、矢印キー、フォーカスを戻すなど）を自前で作り続けることになる。

## 決定

**A を採用する。**

- 部品は `apps/web/src/components/ui/` に置く（Button、DropdownMenu から始め、必要になったら足す）。クラスの結合は `apps/web/src/lib/utils.ts` の `cn`。
- Tailwind CSS v4 は `@tailwindcss/vite` で読み込み、Web（`apps/web/vite.config.ts`）と拡張（`apps/extension/wxt.config.ts`）の両方に入れる。拡張は `@harie/web` の編集画面を使うので、同じ CSS（`@harie/web/styles.css`）を読む。
- **preflight（リセット CSS）は入れない。** 既存の手書き CSS を壊さないため。utilities は CSS の layer に入れず、要素セレクタ（`button` など）より部品のクラスが優先されるようにする。
- 色は既存の CSS 変数（`--accent` など）を `@theme inline` で shadcn の名前（`primary` など）に割り当てる。
- import は相対パスにする。`@/` の別名は拡張（WXT）では拡張自身のルートを指すため、`@harie/web` のソースから使うと解決先がずれる。そのため shadcn の CLI（`components.json`）は置かず、部品は手でコピーして合わせる。

## 結果（影響）

- 良くなること: ヘッダーのボタンとメニューの高さ・見た目が部品の定義で揃う。メニューのキーボード操作とアクセシビリティを Radix に任せられる。
- 悪くなること・受け入れるコスト: CSS の書き方が手書きと Tailwind の 2 通りになる。既存の手書き CSS をすぐには置き換えない。
- 後でやること / 再評価の条件: 既存の画面（モーダル、右の欄、パレット）を触るときに、順に shadcn の部品へ寄せる。`packages/editor` で使う必要が出たら、部品の置き場所を共有パッケージへ移す。
