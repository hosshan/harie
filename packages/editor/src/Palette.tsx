// 編集面の上に浮かぶ道具のパレット。ファイル操作（開く・保存）のボタンと見分けられるよう、
// 画像の上に白いすりガラス（半透明＋ぼかし）で重ね、描いている間は隠す
import type { ReactNode } from "react";
import type { Tool } from "./Canvas";

export type PaletteTool = { tool: Tool; label: string; key: string };

/** 道具のアイコン。右の欄の見出しでも、選んだ注釈の種類を示すのに使う */
export const TOOL_ICONS: Record<Tool, ReactNode> = {
  select: <path d="M6 3l12 9-5.5 1L16 20l-2.5 1-2.6-6.6L6 18z" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  arrow: <path d="M5 19L19 5M10 5h9v9" />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  callout: <path d="M4 5h16v11H11l-4 4v-4H4z" />,
  badge: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.5 9l2-1.5V16" />
    </>
  ),
  mask: (
    <>
      <rect x="4" y="7" width="16" height="10" rx="1.5" />
      <path d="M7 14l3-4M10 14l3-4M13 14l3-4" />
    </>
  ),
};

export function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {children}
    </svg>
  );
}

export type PaletteProps = {
  tools: readonly PaletteTool[];
  tool: Tool;
  onTool: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** 描いている・ドラッグしている間は隠す（描く先に重ならないように） */
  hidden: boolean;
  /** 小さくたたんで、画像に重なる範囲を最小にする */
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

export function Palette({
  tools,
  tool,
  onTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hidden,
  collapsed,
  onCollapsedChange,
}: PaletteProps) {
  const current = tools.find((t) => t.tool === tool);
  return (
    <div
      className="harie-palette"
      role="toolbar"
      aria-label="ツール"
      data-hidden={hidden}
      data-collapsed={collapsed}
    >
      {/* 道具が入りきらない幅（スマホ）では、この中だけを横にスクロールする */}
      <div className="harie-palette-scroll">
        {collapsed ? (
          <button
            type="button"
            className="harie-palette-expand"
            aria-label="ツールを表示"
            title="ツールを表示"
            onClick={() => onCollapsedChange(false)}
          >
            {current !== undefined && <Icon>{TOOL_ICONS[current.tool]}</Icon>}
            <span>ツール</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              className="harie-palette-icon"
              aria-label="元に戻す"
              title="元に戻す（Ctrl / ⌘ + Z）"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Icon>
                <path d="M9 5L4 10l5 5M4 10h10a5 5 0 010 10h-4" />
              </Icon>
            </button>
            <button
              type="button"
              className="harie-palette-icon"
              aria-label="やり直す"
              title="やり直す（Ctrl / ⌘ + Shift + Z）"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Icon>
                <path d="M15 5l5 5-5 5M20 10H10a5 5 0 000 10h4" />
              </Icon>
            </button>
            <span className="harie-palette-sep" />
            {tools.map((t) => (
              <button
                key={t.tool}
                type="button"
                className="harie-palette-tool"
                aria-label={t.label}
                aria-pressed={tool === t.tool}
                title={`${t.label}（${t.key.toUpperCase()}）`}
                onClick={() => onTool(t.tool)}
              >
                <Icon>{TOOL_ICONS[t.tool]}</Icon>
                <span aria-hidden="true">{t.label}</span>
              </button>
            ))}
            <span className="harie-palette-sep" />
            <button
              type="button"
              className="harie-palette-icon"
              aria-label="ツールをたたむ"
              title="ツールをたたむ"
              onClick={() => onCollapsedChange(true)}
            >
              <Icon>
                <path d="M7 10l5 5 5-5" />
              </Icon>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
