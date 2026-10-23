// エディタの状態と元に戻す／やり直す（FR-EDIT-07）
// 変更はすべて applyOps の操作として適用する。ドラッグ中の途中経過は履歴に積まず、離したときに 1 回だけ積む。
// 個人情報のマスクの範囲（適用前の下書き）も、足す・変える・消すを同じ履歴で元に戻せる
import { applyOps, type HarieDocument, type OpError } from "@harie/model";
import { layoutAnchors } from "@harie/render";
import type { MaskDraft } from "./masks";

/** 履歴の 1 コマ。ドキュメントと、マスクの範囲の下書き */
export type Snapshot = { doc: HarieDocument; masks: readonly MaskDraft[] };

export type EditorState = {
  doc: HarieDocument;
  /** 個人情報のマスクの範囲（適用前の下書き。ドキュメントには入れない。FR-EDIT-05） */
  masks: readonly MaskDraft[];
  past: Snapshot[];
  future: Snapshot[];
  /** 選んでいる注釈（複数選べる。先に選んだものから順に並ぶ） */
  selectedIds: readonly string[];
  /** 直前の操作が失敗した理由（UI に出す） */
  error: OpError | null;
};

export type EditorAction =
  | { type: "apply"; ops: readonly unknown[]; select?: Selecting }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; ids: Selecting }
  /** 履歴を捨てて開き直す。masks を渡すと、その範囲を下書きにする（画像の差し替えでかけ直してもらうとき） */
  | { type: "reset"; doc: HarieDocument; masks?: readonly MaskDraft[] }
  /** マスクの範囲の下書きを変える（1 回の操作として元に戻せる） */
  | { type: "masks"; masks: readonly MaskDraft[] }
  /** マスクを画像に適用した。下書きは使い終わったので、元に戻すで戻らないよう履歴からも消す */
  | { type: "masksApplied" }
  /** 保存した。以後の保存でリビジョンが戻らないよう、履歴中のドキュメントにも新しいリビジョンを反映する */
  | { type: "saved"; revision: number; meta: HarieDocument["meta"] }
  /**
   * PII 加工をベース画像に適用した（ADR-0007）。加工は元に戻せないので、
   * 元に戻す／やり直すで記録が消えないよう、履歴中のドキュメントにも同じ記録を反映する
   */
  | { type: "piiApplied"; pii: HarieDocument["pii"] };

/** 選ぶ注釈。1 つなら ID、複数なら ID の並び、選択を外すなら null か空の並び */
export type Selecting = string | null | readonly string[];

const HISTORY_LIMIT = 100;

export function initialState(doc: HarieDocument, masks: readonly MaskDraft[] = []): EditorState {
  return { doc, masks, past: [], future: [], selectedIds: [], error: null };
}

const snapshot = (state: EditorState): Snapshot => ({ doc: state.doc, masks: state.masks });

/** ドキュメントに残っている注釈だけを、重ねずに選ぶ */
function exists(doc: HarieDocument, select: Selecting): readonly string[] {
  const ids = select === null ? [] : typeof select === "string" ? [select] : select;
  return [...new Set(ids)].filter((id) => doc.annotations.some((a) => a.id === id));
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "apply": {
      if (action.ops.length === 0) return state;
      const result = applyOps(state.doc, action.ops);
      if (!result.ok) return { ...state, error: result.error };
      // 枠を動かしたら、紐付けた番号も付いてくる（ADR-0011）
      const doc = layoutAnchors(result.value);
      const select = action.select === undefined ? state.selectedIds : action.select;
      return {
        doc,
        masks: state.masks,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        selectedIds: exists(doc, select),
        error: null,
      };
    }
    case "masks":
      return {
        ...state,
        masks: action.masks,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        error: null,
      };
    case "masksApplied": {
      const clear = (s: Snapshot): Snapshot => (s.masks.length === 0 ? s : { ...s, masks: [] });
      return {
        ...state,
        masks: [],
        past: state.past.map(clear),
        future: state.future.map(clear),
      };
    }
    case "undo": {
      const prev = state.past.at(-1);
      if (prev === undefined) return state;
      return {
        ...state,
        ...prev,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
        selectedIds: exists(prev.doc, state.selectedIds),
        error: null,
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return {
        ...state,
        ...next,
        past: [...state.past, snapshot(state)],
        future: rest,
        selectedIds: exists(next.doc, state.selectedIds),
        error: null,
      };
    }
    case "select":
      return { ...state, selectedIds: exists(state.doc, action.ids) };
    case "reset":
      return initialState(action.doc, action.masks);
    case "saved": {
      const mark = (d: HarieDocument): HarieDocument => ({
        ...d,
        revision: action.revision,
        meta: action.meta,
      });
      return {
        ...state,
        doc: mark(state.doc),
        past: state.past.map((s) => ({ ...s, doc: mark(s.doc) })),
        future: state.future.map((s) => ({ ...s, doc: mark(s.doc) })),
      };
    }
    case "piiApplied": {
      const mark = (d: HarieDocument): HarieDocument => ({ ...d, pii: action.pii });
      return {
        ...state,
        doc: mark(state.doc),
        past: state.past.map((s) => ({ ...s, doc: mark(s.doc) })),
        future: state.future.map((s) => ({ ...s, doc: mark(s.doc) })),
      };
    }
  }
}

/** 新しい注釈の ID。ドキュメント内で一意であればよい */
export function newAnnotationId(doc: HarieDocument, type: string): string {
  let n = doc.annotations.length + 1;
  while (doc.annotations.some((a) => a.id === `${type}-${n}`)) n++;
  return `${type}-${n}`;
}
