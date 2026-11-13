import { describe, expect, it, vi } from "vitest";

vi.mock("wxt/browser", () => ({ browser: {} }));

const { countdown, TIMER_SECONDS, timerDelay } = await import("./timer");

describe("FR-CAP-11: 遅延キャプチャ", () => {
  it("タイマーをオンにしたときだけ待つ（待ち時間は 5 秒に決めてあり、選ばせない）", () => {
    expect(TIMER_SECONDS).toBe(5);
    expect(timerDelay(true)).toBe(5);
    expect(timerDelay(false)).toBe(0);
    expect(timerDelay("true")).toBe(0);
    expect(timerDelay(undefined)).toBe(0);
  });

  it("1 秒ごとに残りを知らせ、最後に 0 を知らせる", async () => {
    const ticks: number[] = [];
    const sleep = vi.fn(async () => {});
    await countdown(3, (n) => void ticks.push(n), new AbortController().signal, sleep);
    expect(ticks).toEqual([3, 2, 1, 0]);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(1000, expect.anything());
  });

  it("途中でやめると、残りを知らせずに止まる", async () => {
    const ticks: number[] = [];
    const controller = new AbortController();
    const sleep = async () => {
      if (ticks.length === 2) controller.abort(new Error("cancelled"));
    };
    await expect(countdown(5, (n) => void ticks.push(n), controller.signal, sleep)).rejects.toThrow(
      "cancelled",
    );
    expect(ticks).toEqual([5, 4]);
  });
});
