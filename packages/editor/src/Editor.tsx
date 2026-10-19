// エディタ全体（編集面と、その上に浮かぶ道具のパレット・選択中の注釈の設定）
import type { Annotation, HarieDocument, LineDash, PiiMask } from "@harie/model";
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
import { type DrawDefaults, loadDrawDefaults, saveDrawDefaults } from "./draw-defaults";
import { type EditorAction, type EditorState, editorReducer, initialState } from "./history";
import { MaskPanel } from "./MaskPanel";
import { type AppliedMask, type MaskDraft, newMaskDraft, toPiiMasks } from "./masks";
import { Icon, Palette, type PaletteTool, TOOL_ICONS } from "./Palette";
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

/** 線の太さの候補（画像のピクセル）。既定はテーマの 4 */
export const STROKE_WIDTHS = [
  { label: "細", value: 2 },
  { label: "中", value: 4 },
  { label: "太", value: 6 },
  { label: "極太", value: 10 },
] as const;
const STROKE_WIDTH_MIN = 1;
const STROKE_WIDTH_MAX = 40;

const LINE_DASHES: readonly { label: string; value: LineDash; dasharray?: string }[] = [
  { label: "実線", value: "solid" },
  { label: "破線", value: "dashed", dasharray: "5 3" },
  { label: "点線", value: "dotted", dasharray: "0 4.5" },
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
  // 前回選んだ線の太さ・文字サイズを、次に描く注釈の初期値にする
  const [drawDefaults, setDrawDefaults] = useState<DrawDefaults>(() => loadDrawDefaults());
  const rememberDrawDefaults = useCallback((patch: DrawDefaults) => {
    setDrawDefaults((prev) => {
      const next = { ...prev, ...patch };
      saveDrawDefaults(next);
      return next;
    });
  }, []);
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
          <div className="harie-stage-fit">
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
              drawDefaults={drawDefaults}
            />
          </div>
          {/* 道具のパレットは台の下端中央に浮かべる（画像の大きさに左右されない） */}
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
            tool !== "mask" && <EmptyInspector tools={tools} />
          ) : (
            <Inspector
              key={selected.id}
              doc={state.doc}
              annotation={selected}
              dispatch={dispatch}
              onDrawDefaults={rememberDrawDefaults}
            />
          )}
          {state.error !== null && <p role="alert">{state.error.message}</p>}
        </aside>
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<Annotation["type"], string> = {
  rect: "四角",
  ellipse: "楕円",
  arrow: "矢印",
  text: "テキスト",
  callout: "吹き出し",
  badge: "番号",
  spotlight: "スポットライト",
  blur: "ぼかし",
};

/** 色を変えると何の色が変わるか（注釈の種類ごと） */
function colorLegend(type: Annotation["type"]): string {
  if (type === "text") return "文字の色";
  if (type === "arrow") return "線の色";
  if (type === "badge") return "色";
  return "枠の色";
}

/** 何も選んでいないとき。何ができるかと、道具のショートカットを案内する */
function EmptyInspector({ tools }: { tools: readonly PaletteTool[] }) {
  return (
    <div className="harie-inspector-empty">
      <p>注釈を選ぶと、ここで文字や色を変えられます。</p>
      <dl>
        {tools
          .filter((t) => t.tool !== "select")
          .map((t) => (
            <div key={t.tool}>
              <dt>
                <kbd>{t.key.toUpperCase()}</kbd>
              </dt>
              <dd>{t.label}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

function Inspector({
  doc,
  annotation,
  dispatch,
  onDrawDefaults,
}: {
  doc: HarieDocument;
  annotation: Annotation;
  dispatch: Dispatch<EditorAction>;
  /** 選んだ線の太さ・文字サイズを、次に描く注釈の初期値として記録する */
  onDrawDefaults: (patch: DrawDefaults) => void;
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
    onDrawDefaults(annotation.type === "badge" ? { badgeFontSize: size } : { fontSize: size });
    if (size !== fontSize) update({ style: { ...annotation.style, fontSize: size } });
  };
  const hasLine =
    annotation.type === "rect" || annotation.type === "ellipse" || annotation.type === "arrow";
  const strokeWidth = annotation.style?.strokeWidth ?? THEMES.default.defaults.strokeWidth;
  const setStrokeWidth = (v: number) => {
    const width = Math.round(Math.min(STROKE_WIDTH_MAX, Math.max(STROKE_WIDTH_MIN, v)));
    onDrawDefaults({ strokeWidth: width });
    if (width !== strokeWidth) update({ style: { ...annotation.style, strokeWidth: width } });
  };
  const dash = annotation.style?.dash ?? "solid";
  const setDash = (v: LineDash) => {
    if (v === dash) return;
    // 実線は既定なので、フィールドごと外す
    const { dash: _, ...rest } = annotation.style ?? {};
    update({ style: v === "solid" ? rest : { ...rest, dash: v } });
  };
  // 文字は 1 打鍵ごとではなく、入力欄を離れたときに 1 回の操作として確定する（元に戻す単位）
  const commitText = () => {
    if (hasText && text !== annotation.text) update({ text });
  };
  const colorKey = annotation.type === "text" ? "color" : "stroke";
  const suggested = annotation.status === "suggested";
  // 色を指定していない注釈は、テーマの既定の色を選んでいるものとして示す
  const current = (annotation.style?.[colorKey] ?? THEMES.default.defaults[colorKey]).toUpperCase();
  const summary = hasLine
    ? `線 ${strokeWidth}px・${LINE_DASHES.find((d) => d.value === dash)?.label ?? ""}`
    : `文字 ${fontSize}px`;

  return (
    <div className="harie-inspector-body">
      <header className="harie-inspector-head">
        <span className="harie-inspector-type">
          <Icon size={16}>
            {annotation.type in TOOL_ICONS ? TOOL_ICONS[annotation.type as Tool] : TOOL_ICONS.rect}
          </Icon>
        </span>
        <h2>
          {TYPE_LABELS[annotation.type]}
          <small>{summary}</small>
        </h2>
        <button
          type="button"
          className="harie-icon-button harie-inspector-delete"
          aria-label="この注釈を削除"
          title="削除（Delete）"
          onClick={() => dispatch({ type: "apply", ops: [{ op: "remove", id: annotation.id }] })}
        >
          <Icon size={16}>
            <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
          </Icon>
        </button>
      </header>
      {suggested && (
        <div className="harie-suggestion-band">
          <span>AI の提案です。採用するまで保存されません。</span>
          <p>
            <button
              type="button"
              className="harie-suggestion-adopt"
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
        </div>
      )}
      {hasText && (
        <label className="harie-field">
          <span className="harie-field-label">文字</span>
          <textarea
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
          />
        </label>
      )}
      {annotation.type === "badge" && (
        <label className="harie-field">
          <span className="harie-field-label">番号</span>
          <input
            type="number"
            className="harie-number"
            min={1}
            value={annotation.number}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              if (v > 0) update({ number: v });
            }}
          />
        </label>
      )}
      {hasFontSize && (
        <SizeField
          legend="文字サイズ"
          options={FONT_SIZES}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          value={fontSize}
          onChange={setFontSize}
          sample={(_, i) => (
            <span className="harie-sample-text" style={{ fontSize: 11 + i * 4 }}>
              あ
            </span>
          )}
        />
      )}
      {hasLine && (
        <SizeField
          legend="線の太さ"
          options={STROKE_WIDTHS}
          min={STROKE_WIDTH_MIN}
          max={STROKE_WIDTH_MAX}
          value={strokeWidth}
          onChange={setStrokeWidth}
          sample={(o) => (
            <span className="harie-sample-line" style={{ height: Math.max(1.5, o.value * 0.8) }} />
          )}
        />
      )}
      {hasLine && (
        <fieldset className="harie-field">
          <legend className="harie-field-label">線の種類</legend>
          <div className="harie-tiles harie-tiles-3">
            {LINE_DASHES.map((d) => (
              <button
                key={d.value}
                type="button"
                className="harie-tile"
                aria-pressed={dash === d.value}
                onClick={() => setDash(d.value)}
              >
                <svg viewBox="0 0 30 8" width="30" height="8" aria-hidden="true">
                  <line
                    x1="2"
                    y1="4"
                    x2="28"
                    y2="4"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap={d.value === "dotted" ? "round" : "butt"}
                    strokeDasharray={d.dasharray}
                  />
                </svg>
                <small>{d.label}</small>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="harie-field">
        <legend className="harie-field-label">{colorLegend(annotation.type)}</legend>
        <div className="harie-swatches">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className="harie-swatch"
              aria-label={c.label}
              title={c.label}
              aria-pressed={current === c.value.toUpperCase()}
              style={{ background: c.value }}
              onClick={() => update({ style: { ...annotation.style, [colorKey]: c.value } })}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/**
 * 文字サイズ・線の太さ。仕上がりの見本のタイルから選ぶ。細かい値は「数値で指定」を開いて入れる
 * （入力欄を離れる・Enter で 1 回の操作として確定する）。候補にない値のときは最初から開いておく
 */
function SizeField({
  legend,
  options,
  min,
  max,
  value,
  onChange,
  sample,
}: {
  legend: string;
  options: readonly { label: string; value: number }[];
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  sample: (option: { label: string; value: number }, index: number) => ReactNode;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const [custom, setCustom] = useState(() => !options.some((o) => o.value === value));
  const commit = () => {
    const v = Number.parseFloat(draft);
    if (Number.isFinite(v) && v > 0) onChange(v);
    else setDraft(String(value));
  };
  return (
    <fieldset className="harie-field">
      <legend className="harie-field-label">
        {legend}
        <span className="harie-field-value">{value}px</span>
      </legend>
      <div className="harie-tiles">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            className="harie-tile"
            aria-label={o.label}
            aria-pressed={value === o.value}
            title={`${o.label}（${o.value}px）`}
            onClick={() => onChange(o.value)}
          >
            {sample(o, i)}
            <small aria-hidden="true">{o.value}</small>
          </button>
        ))}
      </div>
      {custom ? (
        <span className="harie-number-field">
          <button
            type="button"
            aria-label={`${legend}を 1 小さく`}
            disabled={value <= min}
            onClick={() => onChange(value - 1)}
          >
            −
          </button>
          <input
            type="number"
            aria-label={`${legend}（px）`}
            min={min}
            max={max}
            step={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
          />
          <span aria-hidden="true">px</span>
          <button
            type="button"
            aria-label={`${legend}を 1 大きく`}
            disabled={value >= max}
            onClick={() => onChange(value + 1)}
          >
            +
          </button>
        </span>
      ) : (
        <button type="button" className="harie-link-button" onClick={() => setCustom(true)}>
          数値で指定
        </button>
      )}
    </fieldset>
  );
}
