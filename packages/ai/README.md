# @harie/ai

AI による補足の提案（FR-AI-01〜03）と、個人情報の検出（FR-PII-01, 02）。Claude API を利用者自身の API キー（BYOK）で呼ぶか、利用者が OAuth で接続した OpenRouter 経由で呼ぶ（ADR-0012）。

- LLM は `LlmClient` 越しに呼ぶ。実装は Claude API の `createAnthropicClient`（`src/anthropic.ts`、SDK を使う）と、OpenRouter の `createOpenRouterClient`（`src/openrouter.ts`、fetch で OpenAI 互換の Chat Completions を呼ぶ）。ほかは SDK に依存しない。テストではモックの `LlmClient` を渡す。
- LLM の出力は外部入力として zod で検証し、座標を画像の範囲に収めてから注釈にする。
- 提案は `status: "suggested"` の注釈として返す。採用・却下はエディタが行う。
- 個人情報の候補はマスクの下書きにするだけで、加工は利用者が確認してから `@harie/render` の `applyMasks` で行う（ADR-0007）。読み取った元の文字列は保存しない。
- API キーをログ・エラー文・ファイルに出さない（NFR-SEC-04）。

## 主な API

| 名前 | 内容 |
|---|---|
| `createAnthropicClient({ apiKey, ... })` | Claude API の `LlmClient` を作る（既定のモデルは `DEFAULT_MODEL`） |
| `createOpenRouterClient({ apiKey, appUrl?, ... })` | OpenRouter の `LlmClient` を作る（既定のモデルは `OPENROUTER_DEFAULT_MODEL` = 最新の Claude Opus の別名） |
| `detectPiiFromDom(dom)` | LLM を使わずに、DOM のテキストだけから個人情報の候補を返す（FR-PII-06） |
| `suggestAnnotations({ client, image, doc, intent, dom? })` | 「何を説明したいか」から、枠・吹き出しなどの注釈を提案する |
| `detectPii({ client, image, canvas, dom? })` | 画像（と Chrome 拡張で取れた DOM）から個人情報の候補を返す |
| `detectPiiInDom` / `mergePiiFindings` | DOM だけからの検出と、画像からの検出結果との統合 |
| `dummyFor` / `defaultMethod` | 置換用のダミー値と、種類ごとの既定の加工方法 |
| `DomSnapshotSchema` | Chrome 拡張から渡す DOM の要素一覧。座標の補正（`snapToElement`）に使う |
| `AiError` | 利用者にそのまま見せてよい文言を持つエラー |

```ts
import { createAnthropicClient, suggestAnnotations } from "@harie/ai";

const client = createAnthropicClient({ apiKey });
const suggestions = await suggestAnnotations({ client, image, doc, intent: "メンバーを招待する手順" });
```

## 評価

合成画面（架空の値だけを使う）で、個人情報の再現率・適合率と、提案が狙いの要素を指す割合を測る。実際に Claude を呼ぶので CI では動かさない。

```sh
pnpm --filter @harie/ai eval
```

認証の設定（`CLAUDE_CODE_OAUTH_TOKEN` または `ANTHROPIC_API_KEY`）・出力の読み方・これまでの結果は [CLAUDE.md](CLAUDE.md#評価) にある。

## 関連する文書

- 方針: [docs/03-design/architecture.md](../../docs/03-design/architecture.md)（3.3・3.4・4 章）
- [ADR-0007: PII 加工はベース画像に不可逆に適用する](../../docs/adr/0007-pii-masking.md)
