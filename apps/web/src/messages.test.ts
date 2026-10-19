import { describe, expect, it } from "vitest";
import { WEB_MESSAGES } from "./messages";

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    return allStrings((value as (...args: unknown[]) => unknown)("x", "y", "z"));
  }
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

describe("Web エディタの文言（NFR-I18N-01）", () => {
  it("英語の文言に日本語が残っていない", () => {
    expect(allStrings(WEB_MESSAGES.en).filter((s) => /[ぁ-んァ-ヶ一-龯]/.test(s))).toEqual([]);
  });
});
