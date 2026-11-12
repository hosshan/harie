// OS のパスの扱い（macOS / Windows のどちらの区切りでも動く）。Tauri の API を使わずに試せるよう分けている
import type { ImageFormat } from "@harie/format";

/** パスの最後の名前（ファイル名） */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** 同じフォルダーにある別の名前のパス。区切りは元のパスに合わせる */
export function siblingPath(path: string, name: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i < 0 ? name : `${path.slice(0, i + 1)}${name}`;
}

/**
 * 開ける画像か（拡張子で判断する。中身は読み込むときに確かめる）。JPEG / PNG 以外は開くときに変換する（FR-FILE-15）。
 * src-tauri/src/lib.rs の check_openable_path と合わせる
 */
export function isImagePath(path: string): boolean {
  return /\.(jpe?g|png|svg|gif|webp|bmp|avif|hei[cf])$/i.test(path);
}

/** 保存ダイアログで拡張子を付けずに名前を入れたときに、保存形式の拡張子を足す */
export function withExtension(path: string, format: ImageFormat): string {
  const ok = format === "png" ? /\.png$/i : /\.jpe?g$/i;
  return ok.test(path) ? path : `${path}.${format === "png" ? "png" : "jpg"}`;
}
