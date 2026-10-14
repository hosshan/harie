# 連携設計: Chrome 拡張 / MCP サーバー

- ステータス: ドラフト
- 最終更新: 2026-10-07
- 関連: [要件定義](../01-requirements/requirements-definition.md) / [アーキテクチャ](./architecture.md)

## 1. Chrome 拡張

### 1.1 構成（Manifest V3, WXT）

| 部品 | 役割 | 実装 |
|---|---|---|
| ポップアップ / ショートカット（Alt+Shift+S） | キャプチャ開始（見えている範囲・範囲を選ぶ・要素を選ぶ） | `entrypoints/popup/` |
| 選択オーバーレイ（押したときに注入） | 範囲・要素選択。選び終えたらオーバーレイを消してから範囲を送る。（Next）DOM テキストのダミー置換 | `entrypoints/select.ts` |
| DOM スナップショット（押したときに注入） | 可視範囲の主要要素を取る（1.3） | `lib/collect.ts` |
| service worker | `chrome.tabs.captureVisibleTab` で撮影し、範囲選択なら切り抜く。キャプチャを IndexedDB に置き、エディタページを開く | `entrypoints/background.ts`, `lib/capture.ts` |
| エディタページ（拡張内 HTML） | Web と同じ編集画面（`@harie/web` の `Workspace`）を載せる。保存は `chrome.downloads` | `entrypoints/editor/` |

- キャプチャ画像は数 MB になり `chrome.storage.session` の上限に近いため、拡張の IndexedDB に Blob のまま置いてエディタページに渡す。1 日より古いものは次のキャプチャで消す。
- 拡張ページの CSP に `'wasm-unsafe-eval'` を足す（描画エンジンが WASM のため）。それ以外は既定のまま。
- 拡張ページではファイルの上書きができないので、保存は毎回新しいファイルになる（同名なら連番）。

### 1.2 権限

- `activeTab`, `scripting`, `downloads` のみ。ユーザーがボタン・ショートカットを押したタブにだけ一時的にアクセスする（NFR-SEC-03）。常時のサイト権限（`host_permissions`）は取らない。API キーは拡張ページの localStorage に置くので `storage` も要らない。
- 各権限の説明（ストア申請用）は `apps/extension/STORE.md`。
- E2E 用のビルド（`HARIE_E2E=1`）にだけ `<all_urls>` を付ける。テストではツールバーのボタンを押せず、activeTab が付かないため。配布用のビルドに含まれないことを E2E で確かめている。
- 全体キャプチャ（FR-CAP-04, Next）はスクロール撮影の合成で実装する。`debugger` 権限（CDP の `captureBeyondViewport`）は警告バーが出るため、使うならオプトインにする。

### 1.3 DOM スナップショット

AI 提案と PII 検出の精度を上げるため、撮影と同時に可視範囲の主要要素を取得する。

```ts
type DomSnapshot = {
  url: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
  elements: Array<{
    rect: { x: number; y: number; w: number; h: number }; // 画像ピクセル座標に変換済み
    role: string;          // button, link, textbox, heading ... (ARIA role / タグから推定)
    name?: string;         // アクセシブルネーム
    text?: string;         // 表示テキスト（長さ上限あり）
    piiHint?: "email" | "phone" | "name" | "address" | "id" | null; // 入力型・autocomplete・正規表現から推定
  }>;
};
```

- 取得対象は、インタラクティブ要素・見出し・ラベル・表のセルなど。数百要素程度に間引く。
- スナップショットはエディタのメモリ上でのみ使い、既定ではファイルに保存しない。AI を使うときだけ、画像と一緒に要素の一覧（役割・名前・文字・位置）を送る。送信前の案内にもそう書く（NFR-SEC-01）。
- パスワード欄の値は取らない。入力欄の型・`autocomplete`・名前から個人情報の手がかり（`piiHint`）を付け、個人情報の検出で LLM の結果と合わせる。
- 座標は撮った画像の幅 ÷ ビューポートの幅を倍率にして画像ピクセルに直す。範囲選択で切り抜いたときは切り抜きの中の座標にし、半分以上が外に出る要素は捨てる（`lib/snapshot.ts`）。

### 1.4 DOM 置換キャプチャ（FR-PII-05, Next）

撮影前に content script が PII 候補のテキストノードをダミー値に書き換え、撮影後に元へ戻す。フォント・レイアウトが本物のまま差し替わるため、画像処理による置換より自然な仕上がりになる。ページの状態を一時的に変えるので、元に戻す処理を確実に行う（例外時も含む）。

## 2. MCP サーバー

### 2.1 方針

- **ローカル stdio サーバー**として提供する（FR-MCP-01）。実装は `apps/mcp`。`pnpm build` で 1 ファイルにまとめ、npm の `@harie/mcp` として公開して `npx -y @harie/mcp` で起動する（手順は `apps/mcp/CLAUDE.md`）。
- LLM は呼ばない。画像の「見る」「考える」はクライアント側（Claude 等）の LLM が担当し、サーバーは読み書きと描画に徹する。
- 操作できるのは起動時に許可したディレクトリ配下のみ（`--root` 引数。既定はカレントディレクトリ）。

### 2.2 ツール（案）

| ツール | 入力 | 出力 | 要件 |
|---|---|---|---|
| `harie_open` | `path` | 注釈ドキュメント（JSON）、レンダリング画像（image content）、整合性の状態 | FR-MCP-02 |
| `harie_list` | `dir`, `recursive?` | Harie ファイルの一覧（パス・タイトル・注釈数） | FR-MCP-05 |
| `harie_search` | `query`, `dir` | 注釈テキストに一致したファイルと注釈 ID | FR-MCP-05 |
| `harie_create` | `imagePath`, `outPath?`, `title?`, `format?` | 新規 Harie ファイルのパスと docId | FR-MCP-04 |
| `harie_edit` | `path`, `ops: Op[]`, `expectedRevision?` | 新しいリビジョン、レンダリング画像のプレビュー | FR-MCP-03 |
| `harie_preview` | `path`, `ops: Op[]` | 保存せずにレンダリング結果だけ返す | FR-MCP-03 |
| `harie_mask` | `path`, `masks: PiiMask[]`, `confirm?`, `outPath?`, `expectedRevision?` | `confirm` なしは加工後の画像だけ（保存しない）。`confirm: true` で保存 | FR-PII-02〜04 |

実装したのは `harie_open` / `harie_create` / `harie_edit` / `harie_preview` / `harie_list` / `harie_mask`。`harie_search` は Next。

- `harie_edit` は `applyOps()` と同じ操作列（[注釈ドキュメントモデル](./document-model.md)）を受け取る。ツールの入力スキーマは zod（`OpSchema`）から生成し、座標の決まり（ベース画像のピクセル、左上原点）と例をツールの説明に含める。
- 画像は MCP の image content で返す。`harie_open` はファイルそのもの、`harie_edit` / `harie_preview` は描き直した画像（`harie_preview` は AI 提案中の注釈も描く）。
- 保存は一時ファイルに書いてから置き換える（書き込み途中で落ちても元のファイルを壊さない）。`harie_create` は既存ファイルを上書きしない。
- 保存形式は `harie_create` で決める（`format` → `outPath` の拡張子 → 元画像の形式の順）。ベース画像は形式に関わらず元のバイト列のまま埋め込む。以後の `harie_edit` / `harie_mask` は開いたファイルの形式で保存し直す（ベース画像の形式には合わせない）。
- パスは `--root` からの相対パスか絶対パス。`..`・絶対パス・シンボリックリンクで root の外を指すものは拒否する。
- `expectedRevision` を渡すと、別の人・別のツールが先に保存していた場合に失敗させる（楽観的ロック）。
- PII 加工（ベース画像の書き換え、ADR-0007）は確認付きの専用ツール `harie_mask` で行う。誤って元の画像を失わないよう、`confirm` を付けない呼び出しは加工後の見た目を返すだけでファイルを変えない。`confirm: true` で保存し、`outPath` を渡せば別のファイルとして保存する（既存ファイルは上書きしない）。範囲が画像の外にはみ出す指示は拒否する。
- 「どこに何を補足するか」の手引き（FR-MCP-08）は、プロンプト `harie_guide`（引数 `path`, `intent?`）とサーバーの `instructions`（短い版）で渡す。基準の文面は `packages/ai/src/guide.ts` に置き、Web エディタの AI 提案・PII 検出のシステムプロンプトと共有する（MCP は `@harie/ai/guide` だけをバンドルし、Claude API の SDK は取り込まない）。手順（開く → `harie_mask` → 枠＋anchor 付きの吹き出し＋番号 → `harie_preview` → `harie_edit`）と座標・大きさの目安は MCP 側で足す。サーバー自身は LLM を呼ばない方針のまま。
- ツール一覧（tools/list）はクライアントのコンテキストを使うので小さく保つ。`StyleSchema` と `AnnotationSchema` は zod のメタデータに id を付け、JSON Schema では `definitions` の 1 か所を `$ref` で参照する。`harie_preview` の `ops` は `harie_edit` と同じ形式なので、ツール定義では形（`op` の種類）だけを示し、中身はサーバー側の `applyOps` が `OpSchema` で検証する。

### 2.3 将来（Later）

- クラウド保存を始めたら、Streamable HTTP + OAuth のリモート MCP を追加し、チームの画像を横断して更新できるようにする（FR-MCP-06）。
