// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useObjectUrl } from "./object-url";

describe("useObjectUrl", () => {
  const revoked = new Set<string>();
  let count = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => `blob:test/${++count}`,
    revokeObjectURL: (url: string) => revoked.add(url),
  });
  afterEach(() => revoked.clear());

  it("FR-EDIT-01: StrictMode で effect を付け直しても、返す URL は破棄されていない", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { result, unmount } = renderHook(() => useObjectUrl(bytes, "image/jpeg"), {
      reactStrictMode: true,
    });
    const url = result.current;
    expect(url).toMatch(/^blob:/);
    expect(revoked.has(url as string)).toBe(false);
    unmount();
    expect(revoked.has(url as string)).toBe(true);
  });

  it("バイト列が変わったら前の URL を破棄して新しい URL を返す", () => {
    const { result, rerender } = renderHook(({ bytes }) => useObjectUrl(bytes, "image/png"), {
      initialProps: { bytes: new Uint8Array([1]) },
    });
    const first = result.current as string;
    rerender({ bytes: new Uint8Array([2]) });
    expect(revoked.has(first)).toBe(true);
    expect(result.current).not.toBe(first);
    expect(revoked.has(result.current as string)).toBe(false);
  });
});
