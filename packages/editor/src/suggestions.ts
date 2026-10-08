// AI の提案（FR-AI-02）。提案は status: "suggested" の注釈として下書き表示し、採用でフラグを外す（architecture 3.3）。
// 保存時は未採用の提案を除く（prepareForSave）
import type { HarieDocument } from "@harie/model";

/** ids のうち、まだ提案中のもの（採用・却下・削除されたものは除く） */
export function pendingSuggestionIds(doc: HarieDocument, ids: readonly string[]): string[] {
  return ids.filter((id) => doc.annotations.some((a) => a.id === id && a.status === "suggested"));
}

/** 採用する操作。フラグを外すだけで、位置や文字は（利用者が直したものも含めて）そのまま残す */
export function adoptSuggestionOps(doc: HarieDocument, ids: readonly string[]): unknown[] {
  return pendingSuggestionIds(doc, ids).map((id) => ({
    op: "update",
    id,
    patch: { status: undefined },
  }));
}

/** 却下する操作 */
export function rejectSuggestionOps(doc: HarieDocument, ids: readonly string[]): unknown[] {
  return pendingSuggestionIds(doc, ids).map((id) => ({ op: "remove", id }));
}
