// 複数の注釈の選択と、まとめての移動（FR-EDIT-11）。結果は applyOps の操作として返す
import type { Annotation, HarieDocument, Rect } from "@harie/model";
import { annotationBounds } from "@harie/render";
import { movePatch } from "./geometry";

/** Shift を押してクリックしたとき。選んでいなければ加え、選んでいれば外す */
export function toggleSelection(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** 範囲（ドラッグした四角）に少しでも重なる注釈。描いた順に返す */
export function annotationsInRect(doc: HarieDocument, r: Rect): string[] {
  return doc.annotations
    .filter((a) => {
      const b = annotationBounds(a);
      return b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y;
    })
    .map((a) => a.id);
}

/** すでに選んでいるものに、範囲で選んだものを足す（並びは先に選んだものから） */
export function mergeSelection(base: readonly string[], added: readonly string[]): string[] {
  return [...base, ...added.filter((id) => !base.includes(id))];
}

/**
 * 選んだ注釈をまとめて動かす操作（ドラッグ 1 回で 1 つの操作）。枠に紐付けた番号は、枠も一緒に選んでいれば
 * 紐付けたまま枠に付いていく（番号だけを動かしたときは紐付けを外す。ADR-0011）
 */
export function moveOps(
  doc: HarieDocument,
  ids: readonly string[],
  dx: number,
  dy: number,
): unknown[] {
  if (dx === 0 && dy === 0) return [];
  const selected = new Set(ids);
  return doc.annotations
    .filter((a) => selected.has(a.id) && !followsSelectedBox(a, selected))
    .map((a) => ({ op: "update", id: a.id, patch: movePatch(a, dx, dy) }));
}

function followsSelectedBox(a: Annotation, selected: ReadonlySet<string>): boolean {
  return a.type === "badge" && a.anchor !== undefined && selected.has(a.anchor.annotationId);
}

/** 選んだ注釈をまとめて消す操作 */
export function removeOps(ids: readonly string[]): unknown[] {
  return ids.map((id) => ({ op: "remove", id }));
}
