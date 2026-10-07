// エディタの状態と元に戻す／やり直す（FR-EDIT-07）
// 変更はすべて applyOps の操作として適用する。ドラッグ中の途中経過は履歴に積まず、離したときに 1 回だけ積む
import { type AnoiDocument, applyOps, type OpError } from "@anoi/model";

export type EditorState = {
  doc: AnoiDocument;
  past: AnoiDocument[];
  future: AnoiDocument[];
  selectedId: string | null;
  /** 直前の操作が失敗した理由（UI に出す） */
  error: OpError | null;
};

export type EditorAction =
  | { type: "apply"; ops: readonly unknown[]; select?: string | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; id: string | null }
  | { type: "reset"; doc: AnoiDocument }
  /** 保存した。以後の保存でリビジョンが戻らないよう、履歴中のドキュメントにも新しいリビジョンを反映する */
  | { type: "saved"; revision: number; meta: AnoiDocument["meta"] };

const HISTORY_LIMIT = 100;

export function initialState(doc: AnoiDocument): EditorState {
  return { doc, past: [], future: [], selectedId: null, error: null };
}

function exists(doc: AnoiDocument, id: string | null): string | null {
  return id !== null && doc.annotations.some((a) => a.id === id) ? id : null;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "apply": {
      if (action.ops.length === 0) return state;
      const result = applyOps(state.doc, action.ops);
      if (!result.ok) return { ...state, error: result.error };
      const doc = result.value;
      const select = action.select === undefined ? state.selectedId : action.select;
      return {
        doc,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: [],
        selectedId: exists(doc, select),
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
        selectedId: exists(prev, state.selectedId),
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
        selectedId: exists(next, state.selectedId),
        error: null,
      };
    }
    case "select":
      return { ...state, selectedId: exists(state.doc, action.id) };
    case "reset":
      return initialState(action.doc);
    case "saved": {
      const mark = (d: AnoiDocument): AnoiDocument => ({
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
  }
}

/** 新しい注釈の ID。ドキュメント内で一意であればよい */
export function newAnnotationId(doc: AnoiDocument, type: string): string {
  let n = doc.annotations.length + 1;
  while (doc.annotations.some((a) => a.id === `${type}-${n}`)) n++;
  return `${type}-${n}`;
}
