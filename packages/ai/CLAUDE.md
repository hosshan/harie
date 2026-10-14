# packages/ai

AI の補足提案（FR-AI-01〜03）と個人情報の検出（FR-PII-01, 02）。方針は [architecture.md 3.3・3.4・4 章](../../docs/03-design/architecture.md)。

- LLM は `LlmClient`（`src/llm.ts`）越しに呼ぶ。Claude API の実装は `src/anthropic.ts` だけで、ほかのファイルは SDK に依存しない（評価専用の Claude Code 経由の実装は `eval/agent-client.ts`）。テストではモックの `LlmClient` か、SDK に偽の `fetch` を渡す。
- LLM の出力は外部入力。zod のスキーマで検証し、座標は画像の範囲に収めてから注釈にする。注釈は `AnnotationSchema` で検証する。
- 提案は `status: "suggested"` の注釈として返す。採用・却下はエディタ（`packages/editor/src/suggestions.ts`）が行う。
- 個人情報の候補はマスクの下書きにするだけで、加工は利用者が確認してから `applyMasks` で行う（ADR-0007）。読み取った元の文字列は保存しない。ダミー値に元の文字を残さない。
- API キーをログ・エラー文・ファイルに出さない（NFR-SEC-04）。`AiError` の文言は利用者にそのまま見せてよいものにする。
- DOM・`node:*` を使わない（`eval/` を除く）。
- 「どこに何を補足するか」の基準の文面は `src/guide.ts` に置く。AI 提案・PII 検出のシステムプロンプトと、MCP のプロンプト `harie_guide`（apps/mcp。`@harie/ai/guide` で取り込む）が同じ文面を使う。`guide.ts` は何も import しない。

## 評価

合成画面（`eval/screens.ts`。架空の値だけを使う）で、PII の再現率・適合率と、提案が狙いの要素を指す割合を出す。実際に Claude を呼ぶ（費用・利用枠を使う）ので CI では動かさない。

認証は次のどちらか。両方あれば `ANTHROPIC_API_KEY` を使う。

| 方法 | 経路 | 使うもの |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Agent SDK（Claude Code）経由。`eval/agent-client.ts` | Claude のプラン（Pro / Max など）の利用枠 |
| `ANTHROPIC_API_KEY` | Claude API に直接。製品の Web と同じ `src/anthropic.ts` | API の従量課金 |

### CLAUDE_CODE_OAUTH_TOKEN で回す

```sh
# 1. トークンを作る（ブラウザでログインし、表示された sk-ant-oat... を控える。1 回だけでよい）
claude setup-token

# 2. リポジトリの直下で依存を入れる
pnpm install

# 3. トークンを packages/ai/.env に書く（.env は .gitignore 済みでコミットされない）
cp packages/ai/.env.example packages/ai/.env
#    packages/ai/.env を開き、CLAUDE_CODE_OAUTH_TOKEN= の後ろに sk-ant-oat... を貼る

# 4. 評価を回す
pnpm --filter @harie/ai eval

# モデルを変えるとき（既定は claude-opus-5-5）
HARIE_AI_MODEL=claude-sonnet-5-5 pnpm --filter @harie/ai eval
```

- `.env` の代わりに `export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...` でもよい。シェルで設定した値は `.env` より優先される。
- `.env` は `packages/ai/.env` を読み、なければリポジトリ直下の `.env` を読む。
- `ANTHROPIC_API_KEY` が設定されていると（シェルでも `.env` でも）、そちらが使われる。OAuth トークンで回すときは `unset ANTHROPIC_API_KEY` しておく。
- 1 行目に `model: ... / 経由: Claude Code（CLAUDE_CODE_OAUTH_TOKEN）` と出れば、トークンで動いている。
- 画面ごとに 2 回（PII 検出・提案）呼ぶ。4 画面で 8 回。

### ANTHROPIC_API_KEY で回す

```sh
pnpm install
# packages/ai/.env に ANTHROPIC_API_KEY=sk-ant-api... と書く（または、コマンドの前に付ける）
pnpm --filter @harie/ai eval
```

### 出力の読み方（数値は例）

```
model: claude-opus-5-5 / 経由: Claude Code（CLAUDE_CODE_OAUTH_TOKEN）
メンバー一覧: 個人情報 8/9 見つけた・候補 8/9 が正解 / 提案 2 件・狙いの要素に当たり
  × 見落とし: phone「TEL 03-0000-0000」
  × 余分: other「株式会社サンプル」
  - 「メンバーを招待」を押します。
...
個人情報の再現率 95%・適合率 90% / 提案の命中 4/4
```

- 再現率: 写っている個人情報のうち見つけた割合（見落としの少なさ。こちらを重く見る）。適合率: 候補のうち本当に個人情報だった割合。
- `× 見落とし` は見つけられなかった個人情報（正解の種類と値）、`× 余分` は個人情報ではないのに挙げたもの（モデルが答えた種類と値）。値はすべて評価用の架空の値。
- 提案の命中: 「説明したいこと」に対して、狙いの UI 要素（招待ボタンなど）を枠で指した画面の数。
- 認証に失敗すると `失敗: Claude Code での呼び出しに失敗しました: ... 401 ...` と出て止まる。トークンを作り直す。
- プロンプトや座標の処理を変えたら、前後で評価を回して数値を PR に書く。

### 結果の記録

| 日付 | モデル | 個人情報の再現率 | 適合率 | 提案の命中 | メモ |
|---|---|---|---|---|---|
| 2026-10-08 | claude-opus-5-5（OAuth） | 81%（13/16） | 100% | 4/4 | 「お支払い」で 3 件見落とし（1/4）。評価用の値がダミーらしく見えるもの（0 の並ぶ番号・架空の地名・テスト用のカード番号）で、プロンプトの「サンプルだと明らかな値は挙げない」に当たったと推測。プロンプトをダミーらしい値も挙げる形に変えた |
