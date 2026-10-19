// OS のファイルダイアログと、画像ファイルの読み書き（src-tauri/src/lib.rs のコマンド）
import type { ImageFormat } from "@harie/format";
import { webMessages } from "@harie/web/messages";
import { invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { withExtension } from "./paths";

/** ダイアログの種類。名前は表示言語に合わせる */
function filters() {
  const m = webMessages().open;
  return {
    open: [{ name: m.imageFiles, extensions: ["jpg", "jpeg", "png"] }],
    jpeg: [{ name: m.jpegFiles, extensions: ["jpg", "jpeg"] }],
    png: [{ name: m.pngFiles, extensions: ["png"] }],
  };
}

/** 開く画像を選ぶ。取りやめたら null */
export async function chooseImage(): Promise<string | null> {
  const path = await open({ multiple: false, directory: false, filters: filters().open });
  return typeof path === "string" ? path : null;
}

/** 保存先を選ぶ。種類は保存する形式の 1 つだけにする（Web と同じ。既定の拡張子がずれないように）。取りやめたら null */
export async function chooseSavePath(
  defaultPath: string,
  format: ImageFormat,
): Promise<string | null> {
  const path = await save({ defaultPath, filters: filters()[format] });
  return path === null ? null : withExtension(path, format);
}

export async function readImage(path: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>("read_image", { path }));
}

/** バイト列はそのまま本文で送る（JSON にすると画像の大きさの数倍になる）。パスは日本語を含むので URL エンコードする */
export async function writeImage(path: string, bytes: Uint8Array): Promise<void> {
  await invoke("write_image", bytes, { headers: { "Harie-Path": encodeURIComponent(path) } });
}

/** OS から開くように渡されたファイル（関連付け・「このアプリで開く」）を受け取る。受け取った分は Rust 側から消える */
export async function takePendingFiles(): Promise<string[]> {
  return await invoke<string[]>("take_pending_files");
}

/** OS から開くファイルが渡されたことを知らせるイベント（src-tauri/src/lib.rs の receive_files） */
export const OPEN_FILES_EVENT = "harie://open-files";

/** 保存していない変更を捨ててよいか、OS のダイアログで確かめる */
export async function confirmDiscard(action: "open" | "close"): Promise<boolean> {
  const m = webMessages().desktop;
  return await ask(action === "open" ? m.discardOpen : m.discardClose, {
    title: "Harie",
    kind: "warning",
    okLabel: m.discardOk(action),
    cancelLabel: m.cancel,
  });
}
