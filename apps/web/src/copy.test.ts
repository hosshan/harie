import type { HarieDocument } from "@harie/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Opened } from "./load";

const render = vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
vi.mock("./browser-renderer", () => ({ browserRenderer: async () => ({ render }) }));

const { canCopyImage, copyImage } = await import("./copy");

class FakeClipboardItem {
  constructor(readonly items: Record<string, Promise<Blob>>) {}
}

describe("画像をクリップボードにコピーする（FR-FILE-11）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    render.mockClear();
  });

  it("Async Clipboard API と ClipboardItem の両方があるときだけコピーできる", () => {
    const clipboard = { write: async () => {} };
    expect(canCopyImage(clipboard)).toBe(false);
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    expect(canCopyImage(clipboard)).toBe(true);
    expect(canCopyImage(undefined)).toBe(false);
  });

  it("描いた PNG を image/png として書く。描画を待たずに Promise のまま渡す", async () => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    const written: FakeClipboardItem[] = [];
    const clipboard = {
      write: async (items: ClipboardItems) => {
        written.push(...(items as unknown as FakeClipboardItem[]));
      },
    };
    const base = { bytes: new Uint8Array([1]), mediaType: "image/jpeg" as const };
    const doc = {} as HarieDocument;
    await copyImage({ base } as Opened, doc, clipboard);

    expect(render).toHaveBeenCalledWith({ doc, base, output: "png" });
    const png = await written[0]?.items["image/png"];
    expect(png?.type).toBe("image/png");
    expect(new Uint8Array(await (png as Blob).arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
  });
});
