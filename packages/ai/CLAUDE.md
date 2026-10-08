# packages/ai

AI の補足提案（FR-AI-01〜03）と個人情報の検出（FR-PII-01, 02）。方針は [architecture.md 3.3・3.4・4 章](../../docs/03-design/architecture.md)。

- LLM は `LlmClient`（`src/llm.ts`）越しに呼ぶ。Claude API の実装は `src/anthropic.ts` だけで、ほかのファイルは SDK に依存しない。テストではモックの `LlmClient` か、SDK に偽の `fetch` を渡す。
- LLM の出力は外部入力。zod のスキーマで検証し、座標は画像の範囲に収めてから注釈にする。注釈は `AnnotationSchema` で検証する。
- 提案は `status: "suggested"` の注釈として返す。採用・却下はエディタ（`packages/editor/src/suggestions.ts`）が行う。
- 個人情報の候補はマスクの下書きにするだけで、加工は利用者が確認してから `applyMasks` で行う（ADR-0007）。読み取った元の文字列は保存しない。ダミー値に元の文字を残さない。
- API キーをログ・エラー文・ファイルに出さない（NFR-SEC-04）。`AiError` の文言は利用者にそのまま見せてよいものにする。
- DOM・`node:*` を使わない（`eval/` を除く）。

## 評価

```sh
ANTHROPIC_API_KEY=... pnpm --filter @harie/ai eval   # HARIE_AI_MODEL でモデルを変えられる
```

- `eval/screens.ts` の合成画面（架空の値だけを使う）で、PII の再現率・適合率と、提案が狙いの要素を指す割合を出す。実 API を呼び費用がかかるので CI では動かさない。
- プロンプトや座標の処理を変えたら、前後で評価を回して数値を PR に書く。
