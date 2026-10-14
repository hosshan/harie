// 1 段のヘッダー。ロゴ | ファイル名 と、右側にファイル操作・設定のメニューを置く
// （注釈の道具は編集面の上のパレットに分け、どちらの操作か迷わないようにする）
import type { ComponentProps, ReactNode } from "react";
import { Button } from "./components/ui/button";
import { SettingsButton } from "./Settings";

export type HeaderProps = {
  fileName?: string;
  /** 保存の状況など、メニューの左に出す短い文 */
  status?: string | null;
  /** 右側のメニュー（設定の左に並べる） */
  children?: ReactNode;
};

export function Header({ fileName, status, children }: HeaderProps) {
  return (
    <header className="app-header">
      <h1>Harie</h1>
      {fileName !== undefined && (
        <>
          <span className="app-header-sep" aria-hidden="true" />
          <span className="app-file-name">{fileName}</span>
        </>
      )}
      <div className="app-header-menu">
        {status != null && (
          <span className="harie-muted app-header-status" role="status">
            {status}
          </span>
        )}
        {children}
        <SettingsButton />
      </div>
    </header>
  );
}

const ICONS = {
  open: (
    <path d="M3 7.5V18a1.5 1.5 0 001.5 1.5h15A1.5 1.5 0 0021 18V9a1.5 1.5 0 00-1.5-1.5H12L10 5H4.5A1.5 1.5 0 003 6.5z" />
  ),
  save: (
    <>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1.2 1.2" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.2-1.2" />
    </>
  ),
  chevron: <path d="M7 10l5 5 5-5" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
} as const;

/** ヘッダーのボタン（アイコン + 文字）。shadcn/ui の Button なので、メニューの開閉ボタンとも高さが揃う */
export function HeaderButton({
  icon,
  children,
  ...props
}: { icon: keyof typeof ICONS } & ComponentProps<typeof Button>) {
  return (
    <Button {...props}>
      <HeaderIcon icon={icon} />
      {children}
    </Button>
  );
}

export function HeaderIcon({ icon }: { icon: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      {ICONS[icon]}
    </svg>
  );
}
