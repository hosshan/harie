import { describe, expect, it, vi } from "vitest";

vi.mock("wxt/browser", () => ({ browser: {} }));

const { countdown, DEFAULT_DELAY, parseDelay } = await import("./timer");

describe("FR-CAP-11: 遅延キャプチャ", () => {
  it("待ち時間は 3・5・10 秒のどれか。知らない値は既定（3 秒）にする", () => {
    expect(parseDelay(5)).toBe(5);
    expect(parseDelay(10)).toBe(10);
    expect(parseDelay(60)).toBe(DEFAULT_DELAY);
    expect(parseDelay("5")).toBe(DEFAULT_DELAY);
    expect(parseDelay(undefined)).toBe(3);
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
