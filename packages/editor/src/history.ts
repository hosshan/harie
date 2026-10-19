// エディタの状態と元に戻す／やり直す（FR-EDIT-07）
// 変更はすべて applyOps の操作として適用する。ドラッグ中の途中経過は履歴に積まず、離したときに 1 回だけ積む
import { applyOps, type HarieDocument, type OpError } from "@harie/model";
import { layoutAnchors } from "@harie/render";

export type EditorState = {
  doc: HarieDocument;
  past: HarieDocument[];
  future: HarieDocument[];
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
  | { type: "reset"; doc: HarieDocument }
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

export function initialState(doc: HarieDocument): EditorState {
  return { doc, past: [], future: [], selectedIds: [], error: null };
}

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
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: [],
        selectedIds: exists(doc, select),
        error: null,
      };
    }
    case "undo": {
      const prev = state.past.at(-1);
      if (prev === undefined) return state;
      return {
        ...state,
        doc: prev,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        selectedIds: exists(prev, state.selectedIds),
        error: null,
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc],
        future: rest,
        selectedIds: exists(next, state.selectedIds),
        error: null,
      };
    }
    case "select":
      return { ...state, selectedIds: exists(state.doc, action.ids) };
    case "reset":
      return initialState(action.doc);
    case "saved": {
      const mark = (d: HarieDocument): HarieDocument => ({
        ...d,
        revision: action.revision,
        meta: action.meta,
      });
      return {
        ...state,
        doc: mark(state.doc),
        past: state.past.map(mark),
        future: state.future.map(mark),
      };
    }
    case "piiApplied": {
      const mark = (d: HarieDocument): HarieDocument => ({ ...d, pii: action.pii });
      return {
        ...state,
        doc: mark(state.doc),
        past: state.past.map(mark),
        future: state.future.map(mark),
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
