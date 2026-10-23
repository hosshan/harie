// AI の提案のダイアログで聞く項目。項目を足すときはここに並べるだけで、ダイアログに入力欄が増え、
// 入れた内容が項目名付きで AI に送られる（`SuggestInput.context`）
import type { SuggestContext } from "@harie/ai";
import type { WebMessages } from "../messages";

export type SuggestContextField = {
  id: string;
  /** 項目名。入力欄の読み上げ用の名前と、AI に送るときの見出しに使う */
  label: string;
  placeholder: string;
  rows: number;
};

/** 聞く項目（並び順）。intent は「説明したいこと」で、提案の主な手がかりにする */
export function suggestContextFields(m: WebMessages): SuggestContextField[] {
  return [{ id: "intent", label: m.ai.intent, placeholder: m.ai.intentPlaceholder, rows: 3 }];
}

/** 入力した値を、AI に送る形にする。intent 以外は項目名付きの補足として送る */
export function toSuggestRequest(
  fields: readonly SuggestContextField[],
  values: Readonly<Record<string, string>>,
): { intent: string; context: SuggestContext[] } {
  return {
    intent: values.intent ?? "",
    context: fields
      .filter((f) => f.id !== "intent")
      .map((f) => ({ label: f.label, text: values[f.id] ?? "" })),
  };
}
