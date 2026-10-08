// エディタ全体（ツールバー・編集面・選択中の注釈の設定）
import type { Annotation, HarieDocument, PiiMask } from "@harie/model";
import { type Dispatch, useEffect, useMemo, useReducer, useState } from "react";
import { Canvas, type Tool } from "./Canvas";
import { type EditorAction, type EditorState, editorReducer, initialState } from "./history";
import { MaskPanel } from "./MaskPanel";
import { type MaskDraft, newMaskDraft, toPiiMasks } from "./masks";

export function useEditorState(doc: HarieDocument) {
  return useReducer(editorReducer, doc, initialState);
}

const TOOLS: readonly { tool: Tool; label: string; key: string }[] = [
  { tool: "select", label: "選択", key: "v" },
  { tool: "rect", label: "四角", key: "r" },
  { tool: "ellipse", label: "楕円", key: "o" },
  { tool: "arrow", label: "矢印", key: "a" },
  { tool: "text", label: "テキスト", key: "t" },
  { tool: "callout", label: "吹き出し", key: "c" },
  { tool: "badge", label: "番号", key: "n" },
];
const MASK_TOOL = { tool: "mask", label: "個人情報を隠す", key: "m" } as const;

const COLORS = [
  { label: "赤", value: "#E5484D" },
  { label: "橙", value: "#F76B15" },
  { label: "緑", value: "#30A46C" },
  { label: "青", value: "#0B6BCB" },
  { label: "黒", value: "#1C2024" },
];

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export type EditorProps = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  baseImageUrl: string;
  /**
   * 個人情報のマスクをベース画像に適用する（ADR-0007）。描画エンジンを持つ呼び出し側が
   * `applyMasks` で新しいベース画像を作り、`piiApplied` を dispatch する。省略するとマスクの道具を出さない
   */
  onApplyMasks?: (masks: PiiMask[]) => Promise<void>;
};

export function Editor({ state, dispatch, baseImageUrl, onApplyMasks }: EditorProps) {
  const [tool, setTool] = useState<Tool>("select");
  const [masks, setMasks] = useState<MaskDraft[]>([]);
  const canMask = onApplyMasks !== undefined;
  const tools = useMemo(() => (canMask ? [...TOOLS, MASK_TOOL] : TOOLS), [canMask]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId !== null) {
        e.preventDefault();
        dispatch({ type: "apply", ops: [{ op: "remove", id: state.selectedId }] });
      } else if (e.key === "Escape") {
        setTool("select");
        dispatch({ type: "select", id: null });
      } else if (!mod && !e.altKey) {
        const t = tools.find((x) => x.key === e.key);
        if (t !== undefined) setTool(t.tool);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, state.selectedId, tools]);

  const selected = state.doc.annotations.find((a) => a.id === state.selectedId);

  return (
    <div className="harie-editor">
      <div className="harie-toolbar" role="toolbar" aria-label="ツール">
        {tools.map((t) => (
          <button
            key={t.tool}
            type="button"
            aria-pressed={tool === t.tool}
            title={`${t.label}（${t.key.toUpperCase()}）`}
            onClick={() => setTool(t.tool)}
          >
            {t.label}
          </button>
        ))}
        <span className="harie-toolbar-sep" />
        <button
          type="button"
          disabled={state.past.length === 0}
          onClick={() => dispatch({ type: "undo" })}
        >
          元に戻す
        </button>
        <button
          type="button"
          disabled={state.future.length === 0}
          onClick={() => dispatch({ type: "redo" })}
        >
          やり直す
        </button>
      </div>
      <div className="harie-workspace">
        <Canvas
          state={state}
          dispatch={dispatch}
          baseImageUrl={baseImageUrl}
          tool={tool}
          onToolDone={() => setTool("select")}
          masks={masks}
          onMaskDrawn={(rect) => setMasks((m) => [...m, newMaskDraft(m, rect)])}
        />
        <aside className="harie-inspector" aria-label="選択中の注釈">
          {onApplyMasks !== undefined && (tool === "mask" || masks.length > 0) && (
            <MaskPanel
              drafts={masks}
              onChange={setMasks}
              onApply={async () => {
                await onApplyMasks(toPiiMasks(masks));
                setMasks([]);
                setTool("select");
              }}
            />
          )}
          {selected === undefined ? (
            <p className="harie-muted">注釈を選ぶと、ここで文字や色を変えられます。</p>
          ) : (
            <Inspector key={selected.id} annotation={selected} dispatch={dispatch} />
          )}
          {state.error !== null && <p role="alert">{state.error.message}</p>}
        </aside>
      </div>
    </div>
  );
}

function Inspector({
  annotation,
  dispatch,
}: {
  annotation: Annotation;
  dispatch: Dispatch<EditorAction>;
}) {
  const update = (patch: Record<string, unknown>) =>
    dispatch({ type: "apply", ops: [{ op: "update", id: annotation.id, patch }] });
  const hasText = annotation.type === "text" || annotation.type === "callout";
  const [text, setText] = useState(hasText ? annotation.text : "");
  // 文字は 1 打鍵ごとではなく、入力欄を離れたときに 1 回の操作として確定する（元に戻す単位）
  const commitText = () => {
    if (hasText && text !== annotation.text) update({ text });
  };
  const colorKey = annotation.type === "text" ? "color" : "stroke";
  const current = annotation.style?.[colorKey];

  return (
    <div className="harie-inspector-body">
      {hasText && (
        <label>
          文字
          <textarea
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
          />
        </label>
      )}
      {annotation.type === "badge" && (
        <label>
          番号
          <input
            type="number"
            min={1}
            value={annotation.number}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              if (v > 0) update({ number: v });
            }}
          />
        </label>
      )}
      <fieldset>
        <legend>色</legend>
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            className="harie-swatch"
            aria-label={c.label}
            aria-pressed={current === c.value}
            style={{ background: c.value }}
            onClick={() => update({ style: { ...annotation.style, [colorKey]: c.value } })}
          />
        ))}
      </fieldset>
      <button
        type="button"
        onClick={() => dispatch({ type: "apply", ops: [{ op: "remove", id: annotation.id }] })}
      >
        削除
      </button>
    </div>
  );
}
