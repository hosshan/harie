// キャプチャの本体（service worker で動く）。可視範囲を撮り、必要なら切り抜き、DOM 情報と一緒に保存してエディタを開く
import { browser } from "wxt/browser";
import { putCapture } from "./capture-store";
import { collectDomSnapshot } from "./collect";
import {
  type CssRect,
  captureFileName,
  type RawSnapshot,
  toImageRect,
  toImageSnapshot,
} from "./snapshot";

export type CaptureMode = "visible" | "region" | "element";

type Tab = {
  id?: number | undefined;
  windowId?: number | undefined;
  index?: number | undefined;
  url?: string | undefined;
};

/** 範囲・要素選択のオーバーレイを出す。選び終えると content からメッセージが来て finishCapture に進む */
export async function startSelection(tab: Tab, mode: "region" | "element"): Promise<void> {
  const tabId = requireTabId(tab);
  await browser.scripting.executeScript({
    target: { tabId },
    func: (m: string) => {
      (window as Window & { __harieSelectMode?: string }).__harieSelectMode = m;
    },
    args: [mode],
  });
  await browser.scripting.executeScript({ target: { tabId }, files: ["/select.js"] });
}

/**
 * 可視範囲を撮る（FR-CAP-01）。crop を渡すとその範囲（CSS ピクセル）に切り抜く（FR-CAP-02）。
 * 撮影と同時に DOM 情報を取る（FR-CAP-03）。取れないページ（PDF ビューアなど）では画像だけにする
 */
export async function finishCapture(
  tab: Tab,
  crop: CssRect | null,
  now = new Date(),
): Promise<string> {
  const tabId = requireTabId(tab);
  let raw: RawSnapshot | null = null;
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: collectDomSnapshot,
    });
    raw = (result?.result as RawSnapshot | undefined) ?? null;
  } catch {
    raw = null;
  }
  const dataUrl = await browser.tabs.captureVisibleTab(
    tab.windowId ?? browser.windows.WINDOW_ID_CURRENT,
    {
      format: "png",
    },
  );
  let image = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(image);
  const full = { width: bitmap.width, height: bitmap.height };
  // 画像のピクセル ÷ CSS ピクセル。devicePixelRatio とほぼ同じだが、撮った画像の幅から求める方が確実
  const scale = raw === null ? 1 : full.width / raw.viewport.width;
  let imageRect: CssRect | null = null;
  try {
    if (crop !== null) {
      imageRect = toImageRect(crop, scale, full);
      if (imageRect.w === 0 || imageRect.h === 0) throw new Error("選んだ範囲が空です");
      const canvas = new OffscreenCanvas(imageRect.w, imageRect.h);
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error("画像を切り抜けませんでした");
      ctx.drawImage(
        bitmap,
        imageRect.x,
        imageRect.y,
        imageRect.w,
        imageRect.h,
        0,
        0,
        imageRect.w,
        imageRect.h,
      );
      image = await canvas.convertToBlob({ type: "image/png" });
    }
  } finally {
    bitmap.close();
  }
  const size = imageRect === null ? full : { width: imageRect.w, height: imageRect.h };
  let dom = null;
  try {
    dom = raw === null ? null : toImageSnapshot(raw, scale, imageRect, size);
  } catch {
    // DOM 情報は補助なので、形が合わなければ使わない
    dom = null;
  }
  const id = crypto.randomUUID();
  await putCapture({
    id,
    fileName: captureFileName(tab.url ?? raw?.url ?? "", now),
    image,
    dom,
    createdAt: now.getTime(),
  });
  await browser.tabs.create({
    url: browser.runtime.getURL(`/editor.html#${id}`),
    ...(tab.index === undefined ? {} : { index: tab.index + 1 }),
  });
  return id;
}

function requireTabId(tab: Tab): number {
  if (tab.id === undefined) throw new Error("キャプチャするタブがありません");
  return tab.id;
}

/** 撮れないページ（chrome:// やウェブストア）で出す文 */
export function captureErrorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/cannot be scripted|Cannot access|chrome:\/\/|extensions gallery/i.test(text)) {
    return "このページはブラウザの制限でキャプチャできません。通常のウェブページで試してください。";
  }
  return `キャプチャできませんでした: ${text}`;
}
