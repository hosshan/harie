// OS のファイルダイアログと、画像ファイルの読み書き（src-tauri/src/lib.rs のコマンド）
import type { ImageFormat } from "@harie/format";
import { invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { withExtension } from "./paths";

const FILTERS = {
  open: [{ name: "画像", extensions: ["jpg", "jpeg", "png"] }],
  jpeg: [{ name: "JPEG 画像", extensions: ["jpg", "jpeg"] }],
  png: [{ name: "PNG 画像", extensions: ["png"] }],
};

/** 開く画像を選ぶ。取りやめたら null */
export async function chooseImage(): Promise<string | null> {
  const path = await open({ multiple: false, directory: false, filters: FILTERS.open });
  return typeof path === "string" ? path : null;
}

/** 保存先を選ぶ。種類は保存する形式の 1 つだけにする（Web と同じ。既定の拡張子がずれないように）。取りやめたら null */
export async function chooseSavePath(
  defaultPath: string,
  format: ImageFormat,
): Promise<string | null> {
  const path = await save({ defaultPath, filters: FILTERS[format] });
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
export async function confirmDiscard(action: string): Promise<boolean> {
  return await ask(`保存していない変更があります。保存せずに${action}と、変更は失われます。`, {
    title: "Harie",
    kind: "warning",
    okLabel: action,
    cancelLabel: "キャンセル",
  });
}
