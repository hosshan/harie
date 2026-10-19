// 1 段のヘッダー。ロゴ | ファイル名 と、右側にファイル操作・設定のメニューを置く
// （注釈の道具は編集面の上のパレットに分け、どちらの操作か迷わないようにする）。
// 狭い画面（スマホ）では主な操作（primary）だけを残し、ほかは三点メニューにまとめる
import { type ComponentProps, type ReactNode, useId } from "react";
import { Button } from "./components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { useWebMessages } from "./messages";
import { useSettingsDialog } from "./Settings";

/** 広い画面ではボタン、狭い画面では三点メニューの項目として出す操作 */
export type HeaderAction = {
  icon: HeaderIconName;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** start は主な操作の左、end（既定）は右に置く。三点メニューでもこの順に並べる */
  placement?: "start" | "end";
};

export type HeaderProps = {
  fileName?: string;
  /** 保存の状況など、メニューの左に出す短い文（狭い画面では 2 行目に出す） */
  status?: string | null;
  /** どの幅でも出す主な操作（「保存」や「画像を開く」） */
  primary?: ReactNode;
  /** 画面の幅に合わせて、ボタンか三点メニューの項目にする操作 */
  actions?: readonly HeaderAction[];
  /** 広い画面だけで、主な操作の左に出す部品（保存形式のメニューなど） */
  children?: ReactNode;
  /** 狭い画面で children の代わりに三点メニューへ入れる項目 */
  menu?: ReactNode;
};

export function Header({ fileName, status, primary, actions = [], children, menu }: HeaderProps) {
  const m = useWebMessages();
  const settings = useSettingsDialog();
  const start = actions.filter((a) => a.placement === "start");
  const end = actions.filter((a) => a.placement !== "start");
  const button = (a: HeaderAction) => (
    <HeaderButton key={a.label} icon={a.icon} disabled={a.disabled} onClick={a.onSelect}>
      {a.label}
    </HeaderButton>
  );
  const item = (a: HeaderAction) => (
    <DropdownMenuItem key={a.label} disabled={a.disabled} onSelect={a.onSelect}>
      <HeaderIcon icon={a.icon} />
      {a.label}
    </DropdownMenuItem>
  );
  return (
    <header className="app-header" data-has-file={fileName !== undefined}>
      <h1 className="app-logo">
        <BrandMark />
        <span className="app-logo-name">Harie</span>
      </h1>
      {fileName !== undefined && (
        <>
          <span className="app-header-sep" aria-hidden="true" />
          <span className="app-file-name" title={fileName}>
            {fileName}
          </span>
        </>
      )}
      {status != null && (
        <span className="harie-muted app-header-status" role="status" title={status}>
          {status}
        </span>
      )}
      <div className="app-header-menu">
        <div className="app-header-wide">
          {start.map(button)}
          {children}
        </div>
        {primary}
        <div className="app-header-wide">
          {end.map(button)}
          <HeaderButton icon="settings" onClick={settings.open}>
            {m.header.settings}
          </HeaderButton>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="app-header-more px-2" aria-label={m.header.more}>
              <HeaderIcon icon="more" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {start.map(item)}
            {menu}
            {(start.length > 0 || menu !== undefined) && <DropdownMenuSeparator />}
            {end.map(item)}
            <DropdownMenuItem onSelect={settings.open}>
              <HeaderIcon icon="settings" />
              {m.header.settings}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {settings.dialog}
    </header>
  );
}

/** ロゴのシンボル（docs/brand/harie-symbol.svg と同じ形）。四角と丸を大和比（1:√2）で重ねる */
function BrandMark() {
  const clip = useId();
  return (
    <svg viewBox="0 0 512 512" width="28" height="28" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <rect x="72" y="72" width="184" height="184" rx="25.8" />
        </clipPath>
      </defs>
      <rect x="72" y="72" width="184" height="184" rx="25.8" fill="#EBD08A" />
      <circle cx="309.9" cy="309.9" r="130.1" fill="#D4A72C" />
      <circle cx="309.9" cy="309.9" r="130.1" fill="#B0861A" clipPath={`url(#${clip})`} />
    </svg>
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
  replace: (
    <>
      <path d="M20 12a8 8 0 11-2.34-5.66L20 8.5" />
      <path d="M20 3.5v5h-5" />
    </>
  ),
  chevron: <path d="M7 10l5 5 5-5" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
} as const;

/** ヘッダーのボタン（アイコン + 文字）。shadcn/ui の Button なので、メニューの開閉ボタンとも高さが揃う */
export type HeaderIconName = keyof typeof ICONS;

export function HeaderButton({
  icon,
  children,
  ...props
}: { icon: HeaderIconName } & ComponentProps<typeof Button>) {
  return (
    <Button {...props}>
      <HeaderIcon icon={icon} />
      {children}
    </Button>
  );
}

/** 線で描くアイコン。メニュー（body 直下に出る）の中でも同じ見た目になるよう、線の指定を属性で持つ */
export function HeaderIcon({ icon }: { icon: HeaderIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[icon]}
    </svg>
  );
}
