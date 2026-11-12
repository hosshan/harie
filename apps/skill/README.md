# Harie Skill

MCP を設定できない環境でも、Claude から Harie の注釈を作る・直すための [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) です（FR-MCP-09）。
claude.ai のチャットやプロジェクト、Claude Code on the web などのクラウドのセッションで使えます。

中身は `SKILL.md`（手順と注釈の決まり）と `scripts/harie.mjs`（依存なしの Node スクリプト）の 2 ファイルだけです。
スクリプトは npm の [`@harie/mcp`](../mcp/README.ja.md) を `npx` で 1 回ずつ起動してツールを呼ぶので、描画・保存・PII 加工は MCP 版とまったく同じになります。

```
apps/skill/
├── .claude-plugin/plugin.json   Claude Code のプラグインとしての定義
├── skills/harie/                Skill の本体（これを .skill にまとめて配る）
│   ├── SKILL.md
│   └── scripts/harie.mjs
├── scripts/pack.mjs             dist/harie.skill を作る
└── test/                        Vitest（リポジトリの MCP のソースを起動して確かめる）
```

## 使える環境

| 環境 | 入れ方 | 備考 |
|---|---|---|
| claude.ai（チャット・プロジェクト） | [A. .skill をアップロード](#a-claudeai-に-skill-ファイルをアップロードする) | 「コード実行とファイル作成」を有効にし、ネットワークで npm レジストリに出られること |
| Claude Code on the web / Claude のプロジェクトのスレッド | A でアカウントに入れれば自動で同期される。リポジトリ単位なら [C](#c-リポジトリの-claudesettingsjson-に書いておく) | 既定のネットワーク設定（Trusted）で `registry.npmjs.org` に出られる |
| 手元の Claude Code | [B. プラグインとして入れる](#b-claude-code-のプラグインとして入れる) | 手元なら [MCP](../mcp/README.ja.md) を使うほうがトークンが少なく済む |
| このリポジトリ（hosshan/harie）のセッション | 何もしなくてよい | `.claude/skills/harie` から読み込まれる |

どの環境でも Node.js 22 以上と、`npx` が npm レジストリからパッケージを取れることが前提です（初回の呼び出しで取得し、1 回 5〜10 秒かかります）。

## A. claude.ai に .skill ファイルをアップロードする

いちばん広く使える入れ方です。アカウントに入れたスキルは、claude.ai のチャットとプロジェクト、Claude Code on the web のセッションに同期されます。

1. [GitHub Releases](https://github.com/hosshan/harie/releases) の最新の `skill-v*` から `harie.skill` をダウンロードする。
   リポジトリから作るときは `pnpm --filter @harie/skill package`（`apps/skill/dist/harie.skill` ができる）。
2. claude.ai の「設定」→「機能」で「コード実行とファイル作成」を有効にする。
3. 同じ画面の「スキル」で「スキルをアップロード」を選び、`harie.skill` を選ぶ。
4. チャットで画像を添付し、「この画面に通知設定の手順の注釈を付けて」のように頼む。

組織（Team / Enterprise）の場合は、管理者がスキルとコード実行を許可している必要があります。
`.skill` は中身が zip のファイルです（skill-creator が作るものと同じ形式）。`.zip` しか選べない画面では、拡張子を `.zip` に変えればそのまま使えます。

## B. Claude Code のプラグインとして入れる

リポジトリを直接参照するので、.skill ファイルは要りません。更新も `/plugin` から取り込めます。

```
/plugin marketplace add hosshan/harie
/plugin install harie@harie
```

## C. リポジトリの .claude/settings.json に書いておく

Claude Code on the web で、特定のリポジトリを開いたときに毎回入るようにする方法です。そのリポジトリの `.claude/settings.json` に次を足してコミットします。

```json
{
  "extraKnownMarketplaces": {
    "harie": { "source": { "source": "github", "repo": "hosshan/harie" } }
  },
  "enabledPlugins": { "harie@harie": true }
}
```

## D. 手でコピーする

`skills/harie` フォルダを、すべてのプロジェクトで使うなら `~/.claude/skills/harie` に、1 つのリポジトリだけなら `<リポジトリ>/.claude/skills/harie` にコピーします。

## 使い方

入れたあとは、Claude に頼むだけで Skill が使われます。

- 「添付した画面に、プロジェクトの作り方の手順を 3 ステップで注釈して」
- 「この .harie.png の 2 番の説明文を『保存を押します』に直して」
- 「メールアドレスが写っているので隠してから注釈を付けて」
- 「画面が新しくなったので、この画像で差し替えて」

チャットに貼り付けた画像は、環境によってはファイルとして残りません。Skill はアップロード先（`/mnt/user-data/uploads` など）を探し、見つからなければファイルとして添付するよう頼みます。
保存した画像は claude.ai なら `/mnt/user-data/outputs` に置かれ、ダウンロードできます。[Web エディタ](https://harie.studio/app/) で開けば、注釈をそのまま直せます。

スクリプトを直接使うこともできます。

```sh
node skills/harie/scripts/harie.mjs --help
```

## 評価

[評価の結果](../../docs/02-research/skill-effectiveness.md)（2026-11-09）: 頼み方に応じた呼び出しは 24/24 正解。注釈の品質は MCP と同等で、コストは MCP より少し安い（手数と時間は多い）。

```sh
node apps/skill/eval/trigger.mjs --runs 2                            # 呼ばれるべき頼み方で呼ばれるか
node apps/mcp/eval/run.mjs --runs 8 --conditions skill --out /tmp/a  # 作成・修正の課題（採点と集計は apps/mcp/eval/README.md）
```

## 開発

- テスト: `pnpm exec vitest run --project skill`。npm からは取らず、`HARIE_MCP_COMMAND` でリポジトリの `apps/mcp/src` を tsx で起動して確かめる。
- MCP のツールや引数を変えたら、`scripts/harie.mjs` と `SKILL.md` の対応表もそろえる。スクリプトが起動する版は `DEFAULT_SERVER`（`@harie/mcp@^0.7.0`）で、互換性のない変更や、`SKILL.md` で新しい注釈の書き方（`rotation` など）を案内したときはここも上げる。
- リリース: Actions の「Release (prepare)」で target に `skill` を選ぶと版上げの PR ができ、マージすると `skill-v<版>` のタグが付いて `harie.skill` が GitHub Release に添付される（`release-skill.yml`）。
