// 連携の案内（Web のヘッダー）。MCP サーバーを Claude に登録する方法と、Chrome 拡張の入れ方を示す
// （FR-CAP-07, FR-MCP-07）。拡張の中のエディタでは出さない
import { type ReactNode, useState } from "react";
import type { HeaderAction } from "./Header";
import { Modal } from "./Modal";
import { useWebMessages } from "./messages";

export const EXTENSION_STORE_URL =
  "https://chromewebstore.google.com/detail/harie/dgbghdgnmjcgjdmhfnmcdphkafkbefll";

export const MCP_COMMAND = "claude mcp add harie -- npx -y @harie/mcp --root ~/Pictures/guides";

export const MCP_DESKTOP_CONFIG = `{
  "mcpServers": {
    "harie": {
      "command": "npx",
      "args": ["-y", "@harie/mcp", "--root", "/Users/you/Pictures/guides"]
    }
  }
}`;

/** 「連携」の操作（ヘッダーのボタン、狭い画面では三点メニューの項目）と、その案内のダイアログ */
export function useGuide(): { action: HeaderAction; dialog: ReactNode } {
  const m = useWebMessages();
  const [open, setOpen] = useState(false);
  return {
    action: { icon: "link", label: m.guide.button, onSelect: () => setOpen(true) },
    dialog: (
      <Modal open={open} label={m.guide.title} onClose={() => setOpen(false)} className="app-guide">
        <McpGuide />
        <ExtensionGuide />
        <p className="app-modal-actions">
          <button type="button" onClick={() => setOpen(false)}>
            {m.guide.close}
          </button>
        </p>
      </Modal>
    ),
  };
}

/** 文と、その間に挟むコード（奇数番目の要素を <code> にする）。文言の語順は言語ごとに違うため、文言側で並べる */
function WithCode({ parts }: { parts: readonly string[] }) {
  return parts.map((part, i) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: 文言の並びは固定で、順番が変わらない
    i % 2 === 1 ? <code key={i}>{part}</code> : part,
  );
}

function ExtensionGuide() {
  const m = useWebMessages().guide;
  return (
    <section className="app-guide-section" aria-label={m.extensionLabel}>
      <h2>{m.extensionTitle}</h2>
      <p className="harie-muted">{m.extensionAbout}</p>
      <ol>
        <li>{m.extensionStep1}</li>
        <li>
          <WithCode parts={m.extensionStep2("*.harie.png")} />
        </li>
      </ol>
      <p>
        <a href={EXTENSION_STORE_URL} target="_blank" rel="noreferrer">
          {m.extensionStore}
        </a>
      </p>
    </section>
  );
}

function McpGuide() {
  const m = useWebMessages().guide;
  return (
    <section className="app-guide-section" aria-label="MCP">
      <h2>{m.mcpTitle}</h2>
      <p className="harie-muted">
        <WithCode parts={m.mcpAbout("@harie/mcp", "--root")} />
      </p>
      <h3>Claude Code</h3>
      <CopyBlock label={m.claudeCodeCommand} text={MCP_COMMAND} />
      <h3>Claude Desktop</h3>
      <p className="harie-muted">
        <WithCode parts={m.desktopAbout("claude_desktop_config.json")} />
      </p>
      <CopyBlock label={m.desktopConfig} text={MCP_DESKTOP_CONFIG} />
    </section>
  );
}

/** コマンドや設定の文字列と、コピーするボタン */
function CopyBlock({ label, text }: { label: string; text: string }) {
  const m = useWebMessages().guide;
  const [copied, setCopied] = useState(false);
  return (
    <figure className="app-guide-copy" aria-label={label}>
      <pre>{text}</pre>
      <button
        type="button"
        aria-label={m.copyLabel(label)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            // クリップボードが使えない環境では、表示した文字を選んでコピーしてもらう
          }
        }}
      >
        {copied ? m.copied : m.copy}
      </button>
    </figure>
  );
}
