// service worker。ポップアップ・ショートカット・選択オーバーレイからの指示でキャプチャする（integrations.md 1.1）

import type { Locale } from "@harie/editor/locale";
import { browser } from "wxt/browser";
import {
  type CaptureMode,
  captureErrorMessage,
  finishCapture,
  setCaptureLocale,
  startSelection,
} from "@/lib/capture";
import type { CssRect } from "@/lib/snapshot";

type Message =
  | { type: "harie:start"; mode: CaptureMode; tabId: number; locale?: Locale }
  | { type: "harie:selected"; rect: CssRect }
  | { type: "harie:cancelled" };

async function start(
  mode: CaptureMode,
  tabId: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (mode === "visible") await finishCapture(tab, null);
    else await startSelection(tab, mode);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: captureErrorMessage(e) };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    if (message.type === "harie:start") {
      if (message.locale === "ja" || message.locale === "en") setCaptureLocale(message.locale);
      void start(message.mode, message.tabId).then(sendResponse);
      return true;
    }
    if (message.type === "harie:selected" && sender.tab !== undefined) {
      // 選択範囲は外部（ページ側）から来る値なので、数値であることを確かめてから使う
      const r = message.rect;
      if ([r?.x, r?.y, r?.w, r?.h].every((v) => typeof v === "number" && Number.isFinite(v))) {
        void finishCapture(sender.tab, r).catch((e) => console.error(captureErrorMessage(e)));
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

  // E2E から呼ぶ入口（ツールバーのボタンは自動操作できないため）
  (globalThis as { harieStart?: typeof start }).harieStart = start;
});
