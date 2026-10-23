// 画像をクリップボードにコピーする（FR-FILE-11）。ファイルにせず、チャットや文書へそのまま貼り付けたいとき用。
// クリップボードに載せられる画像は PNG だけで、ブラウザが載せる前に描き直すため、注釈データは埋め込まない
import type { HarieDocument } from "@harie/model";
import { browserRenderer } from "./browser-renderer";
import type { Opened } from "./load";

type ClipboardLike = Pick<Clipboard, "write">;

/** 画像をクリップボードに書ける環境か（Async Clipboard API と ClipboardItem がある） */
export function canCopyImage(
  clipboard: ClipboardLike | undefined = globalThis.navigator?.clipboard,
): boolean {
  return typeof clipboard?.write === "function" && typeof globalThis.ClipboardItem === "function";
}

/**
 * 今の注釈を描いた PNG をクリップボードに書く。
 * Safari（デスクトップ版の WebView）は、押した直後に clipboard.write を呼ばないと断るので、
 * 描画を待たずに Promise のまま ClipboardItem に渡す
 */
export async function copyImage(
  opened: Opened,
  doc: HarieDocument,
  clipboard: ClipboardLike = navigator.clipboard,
): Promise<void> {
  const png = (async () => {
    const bytes = await (await browserRenderer()).render({
      doc,
      base: opened.base,
      output: "png",
    });
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/png" });
  })();
  await clipboard.write([new ClipboardItem({ "image/png": png })]);
}
