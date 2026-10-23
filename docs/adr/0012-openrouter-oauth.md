# ADR-0012: AI の接続先に OpenRouter（OAuth PKCE）を加え、API キーを貼らずに使えるようにする

- ステータス: 承認
- 日付: 2026-10-23
- 決定者: Shun（2026-10-23 承認）
- 関連: FR-AI-01〜03 / FR-PII-01 / NFR-SEC-01 / NFR-SEC-04 / [architecture 4 章](../03-design/architecture.md) / PR #65

## 背景

Web / 拡張 / デスクトップの AI 提案と PII 検出は BYOK で、利用者が Anthropic Console で API キーを作り、設定に貼り付ける必要がある（architecture 4 章）。初期ターゲットの PdM には、Console のアカウント作成・支払い設定・キーのコピーが大きなハードルになっている（2026-10-23、Shun）。

制約:

- Web エディタは GitHub Pages の静的サイト（harie.studio/app/）。サーバーを持たない。
- 「ファイルが唯一の正」でサーバーなしに動くこと（NFR-DATA-04）を崩したくない。
- Anthropic は、サードパーティのアプリ向けに API 利用の OAuth を公開していない（Claude のプランのトークンを外部アプリで使うことは規約上できない）。
- Harie が費用を負担してプロキシを置くと、1 回の提案で推定 $0.07〜0.14（Sonnet 5.5 / Opus 5.5）かかり、ログイン・利用上限・不正利用対策の運用が要る。

## 選択肢

### A. いまの BYOK のまま、案内だけ良くする（PR #65 で実施）

- 長所: 追加の実装・運用がない。
- 短所: Console でのアカウント作成・支払い設定・キーのコピーは残る。

### B. OpenRouter の OAuth（PKCE）で接続できるようにする

「OpenRouter で接続」を押す → OpenRouter でログインして許可 → Harie に戻ると、利用者のアカウントに紐付いた API キーが発行され、それを使って OpenRouter 経由で Claude を呼ぶ。

- 長所: ブラウザだけで完結し、サーバーが要らない（PKCE なのでクライアントシークレットもない）。キーをコピーして貼る操作がなくなる。Google などのアカウントでログインでき、Claude 以外のモデルも選べる。Harie 側の費用・不正利用リスクはない（従量課金は利用者の OpenRouter アカウント持ち）。
- 短所: 利用者は OpenRouter のアカウント作成とクレジット購入が要る（OpenRouter の手数料が乗る）。画像が OpenRouter を経由するので、送信先の表示と同意文言を変える必要がある。呼び出し方が OpenAI 互換になり、Anthropic 固有の機能（`server-side-fallback`、`output_config.effort`）は使えない。構造化出力の対応状況は要確認。

### C. Harie がプロキシを置き、AI を提供する

- 長所: 利用者は何も設定しない。いちばん簡単。
- 短所: 費用が利用者数に比例して増え、課金の仕組みがない今は回収できない。サーバー（例: Cloudflare Workers）、ログイン、利用上限、ボット対策、汎用 Claude プロキシとして悪用されない作り、プライバシーポリシーの更新が要る。NFR-DATA-04 の「サーバーなし」の性格が変わる。

### D. ブラウザ内蔵 AI（Chrome の Gemini Nano）

- 長所: キー・費用・送信なし。
- 短所: 対応端末が限られ、画像から位置を読む精度は低い見込み。Chrome 以外では使えない。

## 決定

**B を採用する。** A は PR #65 で済ませ、そのうえで B を「キーを貼る」の横に並べる選択肢として加える。C は利用者が増え、課金の検討を始めるときに改めて ADR を書く。D は採らない。

決め手: サーバーを持たない今の構成のまま、キーをコピーして貼る手間をなくせる唯一の方法で、Harie 側に費用と運用が発生しないため。

## 結果（影響）

実装の要点:

- `packages/ai` に `createOpenRouterClient()` を追加する（`LlmClient` を実装）。`fetch` で OpenAI 互換の Chat Completions を呼び、画像は data URL で渡す。出力は JSON スキーマで受け、これまでどおり zod で検証してから使う。構造化出力が使えないモデルでは、プロンプトで JSON を指示して zod で検証する。SDK は足さない。
- 接続の流れ（`apps/web`）:
  1. `code_verifier` を作り、SHA-256 の `code_challenge` と一緒に sessionStorage に置く。
  2. `https://openrouter.ai/auth?callback_url=<今のページ>&code_challenge=<…>&code_challenge_method=S256` に移る。
  3. 戻ってきた URL の `code` を `POST https://openrouter.ai/api/v1/auth/keys`（`code`、`code_verifier`、`code_challenge_method`）でキーに換え、URL から `code` を消す。
  4. キーは Anthropic のキーと同じく localStorage にだけ置く（NFR-SEC-04）。設定では「接続済み（OpenRouter）」と「接続を解除」を出す。
- 送信の案内（NFR-SEC-01）は、接続先に合わせて「OpenRouter 経由で Anthropic の Claude に送信します」と表示する。
- モデルは既定で Claude（`anthropic/` の画像入力対応モデル）にする。モデルの選択は出さない（評価していないモデルで精度が落ちるのを避ける）。
- デスクトップ（Tauri）は callback を受けるページがないので、最初は Web と拡張だけにする。拡張は `chrome.identity.launchWebAuthFlow` を使う。

- 良くなること: キーをコピーして貼る操作なしで AI 提案と PII 検出を使えるようになる。
- 悪くなること・受け入れるコスト: 接続先が 2 つになり、エラー文言・テスト・評価を両方で保つ必要がある。OpenRouter の手数料は利用者負担。
- 後でやること / 再評価の条件:
  - 実装前に確認する: OpenRouter の callback URL の制約（https のページで受けられるか）、Claude での構造化出力の対応、キーに上限額を付けられるか。
  - `packages/ai/eval` で OpenRouter 経由の精度とトークン数を測り、直接呼ぶ場合と差がないことを確かめる。
  - 利用者が増え、キー不要で使いたいという声が強ければ C を別の ADR で検討する。
