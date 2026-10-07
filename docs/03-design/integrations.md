# 連携設計: Chrome 拡張 / MCP サーバー

- ステータス: ドラフト
- 最終更新: 2026-10-07
- 関連: [要件定義](../01-requirements/requirements-definition.md) / [アーキテクチャ](./architecture.md)

## 1. Chrome 拡張

### 1.1 構成（Manifest V3, WXT）

| 部品 | 役割 |
|---|---|
| アクションボタン / ショートカット | キャプチャ開始 |
| content script（クリック時に注入） | 範囲・要素選択のオーバーレイ、DOM スナップショット取得、（Next）DOM テキストのダミー置換 |
| service worker | `chrome.tabs.captureVisibleTab` で撮影、エディタページを開く |
| エディタページ（拡張内 HTML） | `packages/editor` をそのまま載せる。保存は `chrome.downloads` |

### 1.2 権限

- 既定: `activeTab`, `scripting`, `downloads`, `storage`。ユーザーが拡張を押したタブにだけ一時的にアクセスする（NFR-SEC-03）。
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
- スナップショットはエディタのメモリ上でのみ使い、既定ではファイルに保存しない。

### 1.4 DOM 置換キャプチャ（FR-PII-05, Next）

撮影前に content script が PII 候補のテキストノードをダミー値に書き換え、撮影後に元へ戻す。フォント・レイアウトが本物のまま差し替わるため、画像処理による置換より自然な仕上がりになる。ページの状態を一時的に変えるので、元に戻す処理を確実に行う（例外時も含む）。

## 2. MCP サーバー

### 2.1 方針

- **ローカル stdio サーバー**として `npx @anoi/mcp` で起動できるようにする（FR-MCP-01）。
- LLM は呼ばない。画像の「見る」「考える」はクライアント側（Claude 等）の LLM が担当し、サーバーは読み書きと描画に徹する。
- 操作できるのは起動時に許可したディレクトリ配下のみ（`--root` 引数。既定はカレントディレクトリ）。

### 2.2 ツール（案）

| ツール | 入力 | 出力 | 要件 |
|---|---|---|---|
| `anoi_open` | `path` | 注釈ドキュメント（JSON）、レンダリング画像（image content）、整合性の状態 | FR-MCP-02 |
| `anoi_list` | `dir`, `recursive?` | Anoi ファイルの一覧（パス・タイトル・注釈数） | FR-MCP-05 |
| `anoi_search` | `query`, `dir` | 注釈テキストに一致したファイルと注釈 ID | FR-MCP-05 |
| `anoi_create` | `imagePath`, `outPath?`, `title?` | 新規 Anoi ファイルのパスと docId | FR-MCP-04 |
| `anoi_edit` | `path`, `ops: Op[]`, `expectedRevision?` | 新しいリビジョン、レンダリング画像のプレビュー | FR-MCP-03 |
| `anoi_preview` | `path`, `ops: Op[]` | 保存せずにレンダリング結果だけ返す | FR-MCP-03 |

- `anoi_edit` は `model.apply()` と同じ操作列（[注釈ドキュメントモデル](./document-model.md)）を受け取る。ツールの入力スキーマは zod から生成する。
- `expectedRevision` を渡すと、別の人・別のツールが先に保存していた場合に失敗させる（楽観的ロック）。
- PII 加工（ベース画像の書き換え）は MCP では MVP 対象外。誤って元画像を失うリスクが高いため、Next で確認付きの専用ツールとして追加する。

### 2.3 将来（Later）

- クラウド保存を始めたら、Streamable HTTP + OAuth のリモート MCP を追加し、チームの画像を横断して更新できるようにする（FR-MCP-06）。
