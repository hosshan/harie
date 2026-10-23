import { describe, expect, it } from "vitest";
import { toSuggestRequest } from "./suggest-context";

describe("toSuggestRequest", () => {
  it("FR-AI-01: 説明したいことは intent に、ほかの項目は項目名付きの補足にする", () => {
    const fields = [
      { id: "intent", label: "説明したいこと", placeholder: "", rows: 3 },
      { id: "reader", label: "読者", placeholder: "", rows: 1 },
    ];
    expect(toSuggestRequest(fields, { intent: "通知の設定", reader: "管理者" })).toEqual({
      intent: "通知の設定",
      context: [{ label: "読者", text: "管理者" }],
    });
    expect(toSuggestRequest(fields, {})).toEqual({
      intent: "",
      context: [{ label: "読者", text: "" }],
    });
  });
});
