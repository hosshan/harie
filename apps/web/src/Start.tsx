// 画像を開く前の画面と、画像の取り込み（ファイルを選ぶ・ドラッグ＆ドロップ・貼り付け）。Web と Chrome 拡張の空のエディタで共通
import {
  EDITOR_MESSAGES,
  formatShortcut,
  getLocale,
  isMacPlatform,
  matchesShortcut,
} from "@harie/editor";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { IMAGE_ACCEPT, IMAGE_ACCEPT_ATTR } from "./import-image";
import { useWebMessages, webMessages } from "./messages";

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
};

function imageTypes() {
  return [
    {
      description: webMessages().open.imageFiles,
      accept: IMAGE_ACCEPT,
    },
  ];
}

/** 取り込んだファイル。ファイルを選んだときだけ、上書き保存に使えるハンドルが付く（File System Access API があるとき） */
export type OnImageFile = (file: File, handle: FileSystemFileHandle | null) => void;

/**
 * ドラッグ＆ドロップと貼り付けで画像を取り込む（FR-CAP-05）。`pick` はファイルを選ぶ画面を出す。
 * `input` は隠したファイル入力（File System Access API がない環境で使う）なので、画面のどこかに置く
 */
export function useImageIntake(onFile: OnImageFile): {
  pick: () => Promise<void>;
  input: ReactNode;
} {
  const m = useWebMessages();
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef(onFile);
  latest.current = onFile;

  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file !== undefined) latest.current(file, null);
    };
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file === undefined) return;
      e.preventDefault();
      latest.current(new File([file], file.name || "clipboard.png", { type: file.type }), null);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  const pick = useCallback(async () => {
    const w = window as PickerWindow;
    if (w.showOpenFilePicker === undefined) {
      ref.current?.click();
      return;
    }
    try {
      const [h] = await w.showOpenFilePicker({ types: imageTypes() });
      if (h !== undefined) latest.current(await h.getFile(), h);
    } catch {
      // 選択をやめた
    }
  }, []);

  const input = (
    <input
      ref={ref}
      type="file"
      accept={IMAGE_ACCEPT_ATTR}
      aria-label={m.open.fileInput}
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file !== undefined) latest.current(file, null);
        e.target.value = "";
      }}
    />
  );
  return { pick, input };
}

/**
 * 画像を開く前の画面で、Ctrl / ⌘ + O でファイルを選ぶ（FR-EDIT-12）。
 * 画像を開いた後は Workspace が同じキーを受け持つ（保存していない変更の確認を挟む）ので、`enabled` で切り替える
 */
export function useOpenShortcut(pick: () => unknown, enabled = true): void {
  const latest = useRef(pick);
  latest.current = pick;
  useEffect(() => {
    if (!enabled) return;
    const mac = isMacPlatform();
    const onKey = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, "open", mac)) return;
      e.preventDefault();
      void latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** 「画像を開く」ボタンの title（ショートカットを添える） */
export function openButtonTitle(label: string): string {
  return EDITOR_MESSAGES[getLocale()].withKey(label, formatShortcut("open", isMacPlatform()));
}

/** 画像を開く前の案内（ドロップ・貼り付けの説明）。`integrations` は Web だけで出す（拡張には「連携」がない） */
export function StartHint({ integrations = true }: { integrations?: boolean }) {
  const m = useWebMessages();
  return (
    <div className="app-drop">
      <p>{m.open.dropHint(formatShortcut("paste", isMacPlatform()))}</p>
      <p className="harie-muted">{m.open.formats}</p>
      {integrations && <p className="harie-muted">{m.open.integrations}</p>}
    </div>
  );
}
