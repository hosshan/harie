# ADR-0003: pnpm モノレポと TypeScript ツールチェーン

- ステータス: 提案中
- 日付: 2026-10-07
- 決定者: Shun（承認待ち）
- 関連: [ADR-0002](./0002-app-platform.md) / [アーキテクチャ](../03-design/architecture.md)

## 背景

ADR-0002 により、共有パッケージ（model / format / render / ai / editor）と複数のアプリ（web / extension / desktop / mcp）を TypeScript で持つ。これらを 1 リポジトリでどう管理し、どのツールで品質を保つかを決める。AI エージェントが「1 コマンドで検証できる」ことを重視する。

## 選択肢

### A. pnpm workspaces（+ 必要になったら Turborepo）

- 長所: 依存解決が厳密で、パッケージ間の依存の漏れを検出しやすい。軽量。
- 短所: タスクのキャッシュ・並列化は別途必要（規模が小さいうちは不要）。

### B. Nx

- 長所: 依存グラフ・キャッシュ・生成器が揃う。
- 短所: 設定と概念が多く、小規模には重い。

### C. リポジトリ分割

- 長所: 権限・リリースを分けられる。
- 短所: 形式の変更が複数リポジトリにまたがり、整合性を保ちにくい。

## 決定

A を採用し、以下のツールを使う。

| 用途 | 採用 | 備考 |
|---|---|---|
| パッケージ管理 | pnpm workspaces | Node 22 LTS 以上 |
| 言語 | TypeScript（`strict: true`, `noUncheckedIndexedAccess: true`） | |
| Lint / Format | Biome | ESLint + Prettier より高速・設定が少ない。依存方向の制約が足りなければ ESLint を追加 |
| 単体テスト | Vitest | ブラウザ／Node 両方で実行 |
| E2E | Playwright | Web アプリと拡張の操作テスト |
| スキーマ | zod（→ JSON Schema 生成） | MCP のツール定義と共有 |
| UI | React + Vite | |
| Chrome 拡張 | WXT | Vite ベース、MV3 |
| デスクトップ | Tauri 2 | |
| MCP | `@modelcontextprotocol/sdk` | |

ディレクトリ:

```
apps/{web,extension,desktop,mcp}
packages/{model,format,render,ai,editor}
docs/
```

ルートに `pnpm check`（lint + typecheck + test）を用意し、CI と AI エージェントが同じコマンドで検証する。

## 結果（影響）

- 良くなること: 形式の変更を 1 PR で全アプリに反映できる。検証コマンドが 1 つ。
- 受け入れるコスト: ビルドが遅くなったら Turborepo を足す。
- 再評価の条件: CI 時間が 10 分を超えたらキャッシュ導入を検討する。
