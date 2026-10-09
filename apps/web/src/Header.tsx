// 1 段のヘッダー。ロゴ | ファイル名 と、右側にファイル操作・設定のメニューを置く
// （注釈の道具は編集面の上のパレットに分け、どちらの操作か迷わないようにする）
import type { ReactNode } from "react";
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
