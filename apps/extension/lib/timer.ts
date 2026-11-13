// 遅延キャプチャ（タイマー, FR-CAP-11）。押してから数秒待って撮る。範囲・要素は、待ち終えた画面を止めてその上で選ぶ。
// 待つ間にメニューを開いたりツールチップを出したりできるよう、ポップアップを閉じ、service worker で数える。
// 残りの秒数はツールバーのアイコンのバッジに出す（ページに何かを出すと写り込み、ホバーも外れるため）
import { browser } from "wxt/browser";

/**
 * タイマーの待ち時間（秒）。選ばせず 1 つに決める（選ぶ手間を増やさない）。
 * ツールバーから手を戻してメニューを開くのに足り、service worker が待つ間に止められない長さ
 */
export const TIMER_SECONDS = 5;

/** メッセージで来たタイマーの指定を秒に直す。オンなら TIMER_SECONDS、それ以外は 0（待たない） */
export function timerDelay(timer: unknown): number {
  return timer === true ? TIMER_SECONDS : 0;
}

type Wait = (ms: number, signal: AbortSignal) => Promise<void>;

const wait: Wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      reject(signal.reason);
    });
  });

/**
 * 1 秒ごとに残りの秒数を知らせながら待つ。signal で止めると reject する。
 * 最後に 0 を知らせてから戻る（撮る前にバッジを消すため）
 */
export async function countdown(
  seconds: number,
  onTick: (left: number) => void | Promise<void>,
  signal: AbortSignal,
  sleep: Wait = wait,
): Promise<void> {
  for (let left = seconds; left > 0; left--) {
    signal.throwIfAborted();
    await onTick(left);
    await sleep(1000, signal);
  }
  await onTick(0);
}

let pending: { controller: AbortController; tabId: number; endsAt: number } | null = null;

/** 待っているタイマーの残り（ポップアップで「やめる」を出すため） */
export function pendingTimer(): { tabId: number; left: number } | null {
  if (pending === null) return null;
  return {
    tabId: pending.tabId,
    left: Math.max(0, Math.ceil((pending.endsAt - Date.now()) / 1000)),
  };
}

export function cancelTimer(): boolean {
  if (pending === null) return false;
  pending.controller.abort(new DOMException("cancelled", "AbortError"));
  pending = null;
  void browser.action.setBadgeText({ text: "" });
  return true;
}

/**
 * 待ってから capture を呼ぶ。待っている間に別のタイマーを始めたら、前のものは止める。
 * 待ち終えたときに撮るタブが前面にないと、別のタブを撮ってしまうので撮らない。capture の失敗もバッジで知らせる
 */
export async function runTimer(
  tabId: number,
  seconds: number,
  capture: () => Promise<unknown>,
  messages: { tabChanged: string },
): Promise<void> {
  cancelTimer();
  const controller = new AbortController();
  pending = { controller, tabId, endsAt: Date.now() + seconds * 1000 };
  await clearError();
  await browser.action.setBadgeBackgroundColor({ color: "#b0861a" });
  try {
    await countdown(
      seconds,
      (left) => browser.action.setBadgeText({ text: left === 0 ? "" : String(left) }),
      controller.signal,
    );
  } catch {
    // やめた
    return;
  } finally {
    if (pending?.controller === controller) pending = null;
  }
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab.active) throw new Error(messages.tabChanged);
    await capture();
  } catch (e) {
    await showError(e instanceof Error ? e.message : String(e));
  }
}

/** ポップアップは閉じているので、失敗はバッジの「!」とアイコンの題名で知らせる。次に撮るときに消す */
async function showError(message: string): Promise<void> {
  console.error(message);
  await browser.action.setBadgeBackgroundColor({ color: "#b42318" });
  await browser.action.setBadgeText({ text: "!" });
  await browser.action.setTitle({ title: message });
}

export async function clearError(): Promise<void> {
  await browser.action.setBadgeText({ text: "" });
  // 空にすると manifest の題名（__MSG_actionTitle__）に戻る
  await browser.action.setTitle({ title: "" });
}
