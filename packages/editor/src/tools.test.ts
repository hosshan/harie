import { createDocument } from "@harie/model";
import { describe, expect, it } from "vitest";
import { initialTool } from "./tools";

const base = () =>
  createDocument({
    width: 800,
    height: 600,
    docId: "c8be77cd-bc6d-4747-bf15-12e345a4b522",
    now: new Date("2026-10-30T00:00:00Z"),
  });

describe("画像を開いたときの道具（FR-EDIT-18）", () => {
  it("注釈のない画像を開いたら四角にする", () => {
    expect(initialTool(base())).toBe("rect");
  });

  it("注釈のある画像を開いたら選択にする", () => {
    const doc = {
      ...base(),
      annotations: [{ id: "rect-1", type: "rect", x: 10, y: 10, w: 100, h: 50 }],
    };
    expect(initialTool(doc)).toBe("select");
  });
});
