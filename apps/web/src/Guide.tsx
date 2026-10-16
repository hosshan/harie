// 連携の案内（Web のヘッダー）。MCP サーバーを Claude に登録する方法と、Chrome 拡張の入れ方を示す
// （FR-CAP-07, FR-MCP-07）。拡張の中のエディタでは出さない
import { type ReactNode, useState } from "react";
import type { HeaderAction } from "./Header";
import { Modal } from "./Modal";

const REPO_URL = "https://github.com/hosshan/harie";

export const MCP_COMMAND = "claude mcp add harie -- npx -y @harie/mcp --root ~/Pictures/guides";

export const MCP_DESKTOP_CONFIG = `{
  "mcpServers": {
    "harie": {
      "command": "npx",
      "args": ["-y", "@harie/mcp", "--root", "/Users/you/Pictures/guides"]
    }
  }
}`;

const EXTENSION_BUILD = `git clone ${REPO_URL}.git
cd harie
pnpm install
pnpm --filter @harie/extension build`;

/** 「連携」の操作（ヘッダーのボタン、狭い画面では三点メニューの項目）と、その案内のダイアログ */
export function useGuide(): { action: HeaderAction; dialog: ReactNode } {
  const [open, setOpen] = useState(false);
  return {
    action: { icon: "link", label: "連携", onSelect: () => setOpen(true) },
    dialog: (
      <Modal
        open={open}
        label="ほかのツールと使う"
        onClose={() => setOpen(false)}
        className="app-guide"
      >
        <McpGuide />
        <ExtensionGuide />
        <p className="app-modal-actions">
          <button type="button" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </p>
      </Modal>
    ),
  };
}

function ExtensionGuide() {
  return (
    <section className="app-guide-section" aria-label="Chrome 拡張">
      <h2>Chrome 拡張でキャプチャする</h2>
      <p className="harie-muted">
        表示中のページを撮って、そのまま Harie
        で注釈を付けられます。見えている範囲・ドラッグした範囲・ボタンなどの要素を選んで撮れます。
      </p>
      <p>Chrome ウェブストアには未公開のため、今はソースからビルドして読み込みます。</p>
      <ol>
        <li>
          Node.js 22 以上と pnpm を用意し、次を実行します。
          <CopyBlock label="拡張をビルドするコマンド" text={EXTENSION_BUILD} />
        </li>
        <li>
          Chrome で <code>chrome://extensions</code> を開き、「デベロッパーモード」をオンにします。
        </li>
        <li>
          「パッケージ化されていない拡張機能を読み込む」で{" "}
          <code>apps/extension/.output/chrome-mv3</code> を選びます。
        </li>
        <li>
          ツールバーの Harie を押すか Alt+Shift+S で撮れます。保存した <code>*.harie.png</code>{" "}
          はこの Web 版でも開いて直せます。
        </li>
      </ol>
      <p>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub のリポジトリを開く
        </a>
      </p>
    </section>
  );
}

function McpGuide() {
  return (
    <section className="app-guide-section" aria-label="MCP">
      <h2>Claude から編集する（MCP）</h2>
      <p className="harie-muted">
        MCP サーバー <code>@harie/mcp</code> を登録すると、Claude
        に「保存ボタンを赤枠で囲んで」のように頼んで注釈を付け・直せます。Node.js 22
        以上が必要です。操作できるのは <code>--root</code> で指定したフォルダの中だけです。
      </p>
      <h3>Claude Code</h3>
      <CopyBlock label="Claude Code に登録するコマンド" text={MCP_COMMAND} />
      <h3>Claude Desktop</h3>
      <p className="harie-muted">
        <code>claude_desktop_config.json</code> に追加します。フォルダは自分のパスに変えてください。
      </p>
      <CopyBlock label="Claude Desktop の設定" text={MCP_DESKTOP_CONFIG} />
    </section>
  );
}

/** コマンドや設定の文字列と、コピーするボタン */
function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="app-guide-copy" aria-label={label}>
      <pre>{text}</pre>
      <button
        type="button"
        aria-label={`${label}をコピー`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            // クリップボードが使えない環境では、表示した文字を選んでコピーしてもらう
          }
        }}
      >
        {copied ? "コピーしました" : "コピー"}
      </button>
    </figure>
  );
}
