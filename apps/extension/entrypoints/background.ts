// service worker。ポップアップ・ショートカット・選択オーバーレイからの指示でキャプチャする（integrations.md 1.1）。
// ページ上の Harie 画像の読み込み・エディタで開く処理も受け持つ（integrations.md 1.5）

import { isLocale, type Locale } from "@harie/editor/locale";
import { browser } from "wxt/browser";
import {
  type CaptureMode,
  captureErrorMessage,
  finishCapture,
  grabFrame,
  messages,
  parseFrame,
  setCaptureLocale,
  startSelection,
} from "@/lib/capture";
import { handlePageMessage, PageMessageSchema, syncPageScripts } from "@/lib/page-fetch";
import { onPageSettingsChanged } from "@/lib/page-settings";
import type { CssRect } from "@/lib/snapshot";
import { cancelTimer, clearError, pendingTimer, runTimer, timerDelay } from "@/lib/timer";

type Message =
  | { type: "harie:start"; mode: CaptureMode; tabId: number; timer?: unknown; locale?: Locale }
  | { type: "harie:timer-status" }
  | { type: "harie:timer-cancel" }
  | { type: "harie:selected"; rect: CssRect; frame?: unknown }
  | { type: "harie:cancelled" };

/**
 * キャプチャを始める。タイマーなら 5 秒数え始めてすぐ戻り、ポップアップを閉じさせる（FR-CAP-11）。
 * 撮る許可（activeTab）は押したタブに付き、そのタブでページを移るまで続くので、待ってからでも撮れる。
 * 範囲・要素は、待ち終えた画面を撮って止め、その上で選ぶ（選ぶ操作でメニューが閉じても困らないように）
 */
async function start(
  mode: CaptureMode,
  tabId: number,
  options: { timer?: unknown } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const delay = timerDelay(options.timer);
  try {
    const tab = await browser.tabs.get(tabId);
    cancelTimer();
    await clearError();
    if (delay > 0) {
      void runTimer(
        tabId,
        delay,
        async () => {
          if (mode === "visible") await finishCapture(tab, null);
          else await startSelection(tab, mode, await grabFrame(tab));
        },
        { tabChanged: messages().timerTabChanged },
      );
    } else if (mode === "visible") await finishCapture(tab, null);
    else await startSelection(tab, mode);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: captureErrorMessage(e) };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    const page = PageMessageSchema.safeParse(message);
    if (page.success) {
      void handlePageMessage(page.data, sender).then(sendResponse);
      return true;
    }
    if (message.type === "harie:start") {
      if (isLocale(message.locale)) setCaptureLocale(message.locale);
      void start(message.mode, message.tabId, { timer: message.timer }).then(sendResponse);
      return true;
    }
    if (message.type === "harie:timer-status") {
      sendResponse(pendingTimer());
      return false;
    }
    if (message.type === "harie:timer-cancel") {
      sendResponse(cancelTimer());
      return false;
    }
    if (message.type === "harie:selected" && sender.tab !== undefined) {
      // 選択範囲は外部（ページ側）から来る値なので、数値であることを確かめてから使う
      const r = message.rect;
      if ([r?.x, r?.y, r?.w, r?.h].every((v) => typeof v === "number" && Number.isFinite(v))) {
        // 止めた画面の上で選んだときは、その画面を切り抜く（撮り直すと、閉じたメニューの画面になる）
        const frozen = message.frame === undefined ? undefined : parseFrame(message.frame);
        if (frozen !== null) {
          void finishCapture(sender.tab, r, new Date(), frozen).catch((e) =>
            console.error(captureErrorMessage(e)),
          );
        }
      }
    }
    return false;
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === "capture-visible" && tab?.id !== undefined) {
      void start("visible", tab.id).then((r) => {
        if (!r.ok) console.error(r.message);
      });
    }
  });

  // ページ用のスクリプトは、利用者がポップアップで許可したサイトにだけ入れる（FR-FILE-12, FR-FILE-13）
  browser.permissions.onAdded.addListener(() => void syncPageScripts());
  browser.permissions.onRemoved.addListener(() => void syncPageScripts());
  onPageSettingsChanged(() => void syncPageScripts());
  browser.runtime.onInstalled.addListener(() => void syncPageScripts());
  browser.runtime.onStartup.addListener(() => void syncPageScripts());

  // E2E から呼ぶ入口（ツールバーのボタンは自動操作できないため）
  (globalThis as { harieStart?: typeof start }).harieStart = start;
});
