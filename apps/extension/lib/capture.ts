// キャプチャの本体（service worker で動く）。可視範囲を撮り、必要なら切り抜き、DOM 情報と一緒に保存してエディタを開く
import { getLocale, type Locale } from "@harie/editor/locale";
import { browser } from "wxt/browser";
import { putCapture } from "./capture-store";
import { collectDomSnapshot } from "./collect";
import { extensionMessages } from "./messages";
import {
  type CssRect,
  captureFileName,
  type RawSnapshot,
  toImageRect,
  toImageSnapshot,
} from "./snapshot";

export type CaptureMode = "visible" | "region" | "element";

/**
 * 失敗の文・選択のオーバーレイの言語。service worker は localStorage を読めないので、
 * ポップアップから渡された言語（エディタの設定と同じもの）を覚えておく。渡されるまではブラウザの言語
 */
let locale: Locale = getLocale();

export function setCaptureLocale(next: Locale): void {
  locale = next;
}

/** 今の言語の文言（service worker の中で使う） */
export const messages = () => extensionMessages(locale);

type Tab = {
  id?: number | undefined;
  windowId?: number | undefined;
  index?: number | undefined;
  url?: string | undefined;
};

/**
 * 撮った瞬間の画面と DOM 情報。タイマーで撮った画面を止め、その上で範囲・要素を選ぶとき（FR-CAP-11）は、
 * オーバーレイ（content script の隔離された環境）に預け、選び終えたときに範囲と一緒に返してもらう
 * （選んでいる間に service worker が止まっても失われないように）
 */
export type Frame = { dataUrl: string; raw: RawSnapshot | null };

/** ページから返ってきた止めた画面を確かめる。形が違えば null（撮り直さず、失敗にする） */
export function parseFrame(value: unknown): Frame | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { dataUrl?: unknown; raw?: unknown };
  if (typeof v.dataUrl !== "string" || !v.dataUrl.startsWith("data:image/png;base64,")) return null;
  const raw = v.raw as RawSnapshot | null | undefined;
  const width = raw?.viewport?.width;
  const valid =
    raw !== null &&
    typeof raw === "object" &&
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    Array.isArray(raw.elements);
  // DOM 情報は補助なので、形が合わなければ画像だけにする（中身は toImageSnapshot が zod で確かめる）
  return { dataUrl: v.dataUrl, raw: valid ? raw : null };
}

/**
 * 範囲・要素選択のオーバーレイを出す。選び終えると content からメッセージが来て finishCapture に進む。
 * frame を渡すと、その画面を止めてオーバーレイの背景に出し、その上で選ぶ（タイマーのあとでメニューが閉じても困らない）。
 * 要素は、今の DOM ではなく撮ったときの要素の位置で選ぶ
 */
export async function startSelection(
  tab: Tab,
  mode: "region" | "element",
  frame: Frame | null = null,
): Promise<void> {
  const tabId = requireTabId(tab);
  await browser.scripting.executeScript({
    target: { tabId },
    func: (m: string, hint: string, f: Frame | null) => {
      const w = window as Window & {
        __harieSelectMode?: string;
        __harieSelectHint?: string;
        __harieFrozen?: Frame | null;
      };
      w.__harieSelectMode = m;
      w.__harieSelectHint = hint;
      w.__harieFrozen = f;
    },
    args: [mode, mode === "region" ? messages().dragHint : messages().clickHint, frame],
  });
  await browser.scripting.executeScript({ target: { tabId }, files: ["/select.js"] });
}

/** 今の画面を撮る（DOM 情報も一緒に）。取れないページ（PDF ビューアなど）では DOM 情報なし */
export async function grabFrame(tab: Tab): Promise<Frame> {
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
    { format: "png" },
  );
  return { dataUrl, raw };
}

/**
 * 可視範囲を撮る（FR-CAP-01）。crop を渡すとその範囲（CSS ピクセル）に切り抜く（FR-CAP-02）。
 * 撮影と同時に DOM 情報を取る（FR-CAP-03）。frame を渡すと撮り直さずにその画面を使う（FR-CAP-11）
 */
export async function finishCapture(
  tab: Tab,
  crop: CssRect | null,
  now = new Date(),
  frame?: Frame,
): Promise<string> {
  const { dataUrl, raw } = frame ?? (await grabFrame(tab));
  let image = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(image);
  const full = { width: bitmap.width, height: bitmap.height };
  // 画像のピクセル ÷ CSS ピクセル。devicePixelRatio とほぼ同じだが、撮った画像の幅から求める方が確実
  const scale = raw === null ? 1 : full.width / raw.viewport.width;
  let imageRect: CssRect | null = null;
  try {
    if (crop !== null) {
      imageRect = toImageRect(crop, scale, full);
      if (imageRect.w === 0 || imageRect.h === 0) throw new Error(messages().emptyRange);
      const canvas = new OffscreenCanvas(imageRect.w, imageRect.h);
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error(messages().cropFailed);
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
  if (tab.id === undefined) throw new Error(messages().noTab);
  return tab.id;
}

/** 撮れないページ（chrome:// やウェブストア）で出す文 */
export function captureErrorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/cannot be scripted|Cannot access|chrome:\/\/|extensions gallery/i.test(text)) {
    return messages().restricted;
  }
  return messages().failedWith(text);
}
