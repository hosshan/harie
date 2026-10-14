// エディタ全体（編集面と、その上に浮かぶ道具のパレット・選択中の注釈の設定）
import type { Annotation, HarieDocument, PiiMask } from "@harie/model";
import { THEMES } from "@harie/render";
import {
  type Dispatch,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { Canvas, type Tool } from "./Canvas";
import { type EditorAction, type EditorState, editorReducer, initialState } from "./history";
import { MaskPanel } from "./MaskPanel";
import { type AppliedMask, type MaskDraft, newMaskDraft, toPiiMasks } from "./masks";
import { Palette, type PaletteTool } from "./Palette";
import { adoptSuggestionOps, rejectSuggestionOps } from "./suggestions";

export function useEditorState(doc: HarieDocument) {
  return useReducer(editorReducer, doc, initialState);
}

const TOOLS: readonly PaletteTool[] = [
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

/** 文字サイズの候補（画像のピクセル。1pt = 1px として扱う）。既定はテーマの 24 */
export const FONT_SIZES = [
  { label: "小", value: 16 },
  { label: "中", value: 24 },
  { label: "大", value: 36 },
  { label: "特大", value: 48 },
] as const;
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export type EditorProps = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** ベース画像の URL。用意できるまでは undefined（注釈だけを描く） */
  baseImageUrl: string | undefined;
  /**
   * 個人情報のマスクをベース画像に適用する（ADR-0007）。描画エンジンを持つ呼び出し側が
   * `applyMasks` で新しいベース画像を作り、`piiApplied` を dispatch する。省略するとマスクの道具を出さない
   */
  onApplyMasks?: (masks: PiiMask[]) => Promise<void>;
  /**
   * 適用前のマスク範囲を呼び出し側で持つとき（個人情報の検出結果を下書きとして渡す。FR-PII-01）。
   * 省略するとエディタの中で持つ
   */
  masks?: MaskDraft[];
  onMasksChange?: (masks: MaskDraft[]) => void;
  /** 適用済みで、まだ保存していないマスク。選択の道具で選んで外せる（ADR-0009） */
  appliedMasks?: readonly AppliedMask[];
  /** 適用済みのマスクを外す（加工前の画像から、残りのマスクをかけ直す） */
  onUnmask?: (id: string) => Promise<void>;
  /** 右側の欄の先頭に出す内容（AI のパネルなど） */
  aside?: ReactNode;
};

export function Editor({
  state,
  dispatch,
  baseImageUrl,
  onApplyMasks,
  masks: controlledMasks,
  onMasksChange,
  appliedMasks = [],
  onUnmask,
  aside,
}: EditorProps) {
  const [tool, setTool] = useState<Tool>("select");
  const [dragging, setDragging] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [ownMasks, setOwnMasks] = useState<MaskDraft[]>([]);
  const masks = controlledMasks ?? ownMasks;
  const setMasks = (next: MaskDraft[]) => {
    if (controlledMasks === undefined) setOwnMasks(next);
    onMasksChange?.(next);
  };
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  const selectedMask = appliedMasks.find((m) => m.id === selectedMaskId);
  const [unmasking, setUnmasking] = useState(false);
  const [unmaskError, setUnmaskError] = useState<string | null>(null);
  const unmask = useCallback(
    async (id: string) => {
      if (onUnmask === undefined) return;
      setUnmasking(true);
      setUnmaskError(null);
      try {
        await onUnmask(id);
        setSelectedMaskId(null);
      } catch (e) {
        setUnmaskError(
          `隠すのをやめられませんでした: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        setUnmasking(false);
      }
    },
    [onUnmask],
  );
  // 注釈を選んだら、適用済みのマスクの選択は外す（右の欄に出すのはどちらか一方）
  useEffect(() => {
    if (state.selectedId !== null) setSelectedMaskId(null);
  }, [state.selectedId]);
  const canMask = onApplyMasks !== undefined;
  const tools = useMemo(() => (canMask ? [...TOOLS, MASK_TOOL] : TOOLS), [canMask]);
  // マスクの範囲を選んでいる間は注釈の選択を外す。右の欄の「削除」や Delete キーで、
  // マスクの範囲ではなく前に選んでいた注釈が消えてしまうのを防ぐ
  const selectTool = useCallback(
    (next: Tool) => {
      setTool(next);
      if (next === "mask") {
        dispatch({ type: "select", id: null });
        setSelectedMaskId(null);
      }
    },
    [dispatch],
  );
  /** マスクの範囲選びをやめる。適用前の範囲はすべて捨てる */
  const cancelMasks = () => {
    setMasks([]);
    setTool("select");
  };

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
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedMask !== undefined) {
        e.preventDefault();
        if (!unmasking) void unmask(selectedMask.id);
      } else if (e.key === "Escape") {
        setTool("select");
        dispatch({ type: "select", id: null });
        setSelectedMaskId(null);
      } else if (!mod && !e.altKey) {
        const t = tools.find((x) => x.key === e.key);
        if (t !== undefined) selectTool(t.tool);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, state.selectedId, tools, selectTool, selectedMask, unmask, unmasking]);

  const selected = state.doc.annotations.find((a) => a.id === state.selectedId);

  return (
    <div className="harie-editor">
      <div className="harie-workspace">
        <div className="harie-stage">
          <Canvas
            state={state}
            dispatch={dispatch}
            baseImageUrl={baseImageUrl}
            tool={tool}
            onToolDone={() => setTool("select")}
            masks={masks}
            onMaskDrawn={(rect) => setMasks([...masks, newMaskDraft(masks, rect)])}
            {...(onUnmask === undefined
              ? {}
              : {
                  appliedMasks,
                  selectedAppliedMaskId: selectedMask?.id ?? null,
                  onSelectAppliedMask: setSelectedMaskId,
                })}
            onDraggingChange={setDragging}
          />
          <Palette
            tools={tools}
            tool={tool}
            onTool={selectTool}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
            onUndo={() => dispatch({ type: "undo" })}
            onRedo={() => dispatch({ type: "redo" })}
            hidden={dragging}
            collapsed={paletteCollapsed}
            onCollapsedChange={setPaletteCollapsed}
          />
        </div>
        <aside className="harie-inspector" aria-label="選択中の注釈">
          {aside}
          {onApplyMasks !== undefined && (tool === "mask" || masks.length > 0) && (
            <MaskPanel
              drafts={masks}
              onChange={setMasks}
              onCancel={cancelMasks}
              onApply={async () => {
                await onApplyMasks(toPiiMasks(masks));
                setMasks([]);
                setTool("select");
              }}
            />
          )}
          {selected === undefined && selectedMask !== undefined ? (
            <section className="harie-inspector-body" aria-label="隠した範囲">
              <h2>隠した範囲 {appliedMasks.indexOf(selectedMask) + 1}</h2>
              <p className="harie-muted">
                保存するまでは、隠すのをやめられます。保存すると元に戻せません。
              </p>
              <button
                type="button"
                disabled={unmasking}
                onClick={() => void unmask(selectedMask.id)}
              >
                {unmasking ? "元に戻しています…" : "隠すのをやめる"}
              </button>
              {unmaskError !== null && <p role="alert">{unmaskError}</p>}
            </section>
          ) : selected === undefined ? (
            tool !== "mask" && (
              <p className="harie-muted">注釈を選ぶと、ここで文字や色を変えられます。</p>
            )
          ) : (
            <Inspector
              key={selected.id}
              doc={state.doc}
              annotation={selected}
              dispatch={dispatch}
            />
          )}
          {state.error !== null && <p role="alert">{state.error.message}</p>}
        </aside>
      </div>
    </div>
  );
}

function Inspector({
  doc,
  annotation,
  dispatch,
}: {
  doc: HarieDocument;
  annotation: Annotation;
  dispatch: Dispatch<EditorAction>;
}) {
  const update = (patch: Record<string, unknown>) =>
    dispatch({ type: "apply", ops: [{ op: "update", id: annotation.id, patch }] });
  const hasText = annotation.type === "text" || annotation.type === "callout";
  const annotationText = hasText ? annotation.text : "";
  const [text, setText] = useState(annotationText);
  // 編集面でのその場編集・元に戻すで文字が変わったら、入力欄も合わせる
  useEffect(() => setText(annotationText), [annotationText]);
  const hasFontSize = hasText || annotation.type === "badge";
  const fontSize = annotation.style?.fontSize ?? THEMES.default.defaults.fontSize;
  const setFontSize = (v: number) => {
    const size = Math.round(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, v)));
    if (size !== fontSize) update({ style: { ...annotation.style, fontSize: size } });
  };
  // 文字は 1 打鍵ごとではなく、入力欄を離れたときに 1 回の操作として確定する（元に戻す単位）
  const commitText = () => {
    if (hasText && text !== annotation.text) update({ text });
  };
  const colorKey = annotation.type === "text" ? "color" : "stroke";
  const suggested = annotation.status === "suggested";
  const current = annotation.style?.[colorKey];

  return (
    <div className="harie-inspector-body">
      {suggested && (
        <p className="harie-suggestion-actions">
          <span className="harie-muted">AI の提案です。採用するまで保存されません。</span>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: "apply", ops: adoptSuggestionOps(doc, [annotation.id]) })
            }
          >
            採用
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: "apply", ops: rejectSuggestionOps(doc, [annotation.id]) })
            }
          >
            却下
          </button>
        </p>
      )}
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
      {hasFontSize && <FontSizeField value={fontSize} onChange={setFontSize} />}
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
        この注釈を削除
      </button>
    </div>
  );
}

/** 文字サイズ。候補から選ぶか、pt を直接入れる（入力欄を離れる・Enter で 1 回の操作として確定する） */
function FontSizeField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number.parseFloat(draft);
    if (Number.isFinite(v) && v > 0) onChange(v);
    else setDraft(String(value));
  };
  return (
    <fieldset className="harie-font-size">
      <legend>文字サイズ</legend>
      {FONT_SIZES.map((s) => (
        <button
          key={s.value}
          type="button"
          aria-pressed={value === s.value}
          title={`${s.value}pt`}
          onClick={() => onChange(s.value)}
        >
          {s.label}
        </button>
      ))}
      <label className="harie-font-size-pt">
        <input
          type="number"
          aria-label="文字サイズ（pt）"
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
        pt
      </label>
    </fieldset>
  );
}
