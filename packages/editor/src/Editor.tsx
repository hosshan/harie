// エディタ全体（編集面と、その上に浮かぶ道具のパレット・選択中の注釈の設定）
import {
  type Annotation,
  AnnotationSchema,
  type HarieDocument,
  type LineDash,
  type PiiMask,
} from "@harie/model";
import { completeSteps, THEMES } from "@harie/render";
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
import {
  addPaletteColor,
  COLOR_PALETTE_KEY,
  loadColorPalette,
  normalizeHex,
  removePaletteColor,
  saveColorPalette,
} from "./color-palette";
import {
  type DrawDefaults,
  loadDrawDefaults,
  saveDrawDefaults,
  scaleDrawDefaults,
  styleForNew,
  unscaleDrawDefaults,
} from "./draw-defaults";
import { elementPadding, elementStepOps, type PickableElement } from "./element-pick";
import { type EditorAction, type EditorState, editorReducer, initialState } from "./history";
import { EDITOR_MESSAGES, type EditorMessages } from "./i18n/messages";
import { useMessages } from "./i18n/use-locale";
import { MaskPanel } from "./MaskPanel";
import { type AppliedMask, type MaskDraft, newMaskDraft, toPiiMasks } from "./masks";
import { Icon, Palette, type PaletteAction, type PaletteTool, TOOL_ICONS } from "./Palette";
import { moveOps, pasteOps, type Reorder, removeOps, reorderOps, resizeOps } from "./selection";
import { formatShortcut, isMacPlatform, matchesShortcut, type ShortcutId } from "./shortcuts";
import { adoptSuggestionOps, rejectSuggestionOps } from "./suggestions";
import { initialTool, TOOL_SHORTCUTS } from "./tools";

/** コピーした注釈をクリップボードに入れる形式。貼り付けるときは外部入力として検証する */
export const ANNOTATIONS_MIME = "application/x-harie-annotations+json";
const ClipboardSchema = AnnotationSchema.array().max(500);

export function useEditorState(doc: HarieDocument) {
  return useReducer(editorReducer, doc, initialState);
}

const COLORS = [
  { name: "red", value: "#E5484D" },
  { name: "orange", value: "#F76B15" },
  { name: "green", value: "#30A46C" },
  { name: "blue", value: "#0B6BCB" },
  { name: "black", value: "#1C2024" },
] as const;

/** 文字サイズの候補（画像のピクセル。1pt = 1px として扱う）。既定はテーマの 24 */
export const FONT_SIZES = [
  { name: "small", value: 16 },
  { name: "medium", value: 24 },
  { name: "large", value: 36 },
  { name: "xlarge", value: 48 },
] as const;
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;

/** 線の太さの候補（画像のピクセル）。既定はテーマの 4 */
export const STROKE_WIDTHS = [
  { name: "thin", value: 2 },
  { name: "medium", value: 4 },
  { name: "thick", value: 6 },
  { name: "xthick", value: 10 },
] as const;
const STROKE_WIDTH_MIN = 1;
const STROKE_WIDTH_MAX = 40;

const LINE_DASHES: readonly { value: LineDash; dasharray?: string }[] = [
  { value: "solid" },
  { value: "dashed", dasharray: "5 3" },
  { value: "dotted", dasharray: "0 4.5" },
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
  /** 適用済みで、まだ保存していないマスク。選択の道具で選んで外せる（ADR-0009） */
  appliedMasks?: readonly AppliedMask[];
  /** 適用済みのマスクを外す（加工前の画像から、残りのマスクをかけ直す） */
  onUnmask?: (id: string) => Promise<void>;
  /**
   * 右側の欄の末尾に出す内容（AI の提案など）。注釈を選んでいない・マスクの範囲を選んでいないときだけ出し、
   * 選んだ注釈の設定の邪魔をしない
   */
  aside?: ReactNode;
  /** パレットの道具の後ろに並べる操作（AI の提案など） */
  paletteActions?: readonly PaletteAction[];
  /** 個人情報のマスクの欄の末尾に出す内容（個人情報を探す操作など）。マスクの範囲を選んでいる間だけ出す */
  maskAside?: ReactNode;
  /** ショートカット一覧を開く（? キー・パレットのボタン）。省略すると開く手段を出さない */
  onShowShortcuts?: () => void;
  /**
   * 要素で囲む道具で選べる要素（Chrome 拡張で取った DOM。FR-EDIT-15）。
   * 空か省略すると道具を出さない
   */
  elements?: readonly PickableElement[];
  /**
   * 画像の解像度の倍率（`estimateImageScale`。FR-EDIT-16）。新しく描く注釈の線の太さ・文字サイズ、太さ・大きさの候補、
   * 要素と枠の間の余白にこの倍率を掛ける。省略すると 1
   */
  imageScale?: number;
};

export function Editor({
  state,
  dispatch,
  baseImageUrl,
  onApplyMasks,
  appliedMasks = [],
  onUnmask,
  aside,
  maskAside,
  paletteActions = [],
  onShowShortcuts,
  elements = [],
  imageScale = 1,
}: EditorProps) {
  const m = useMessages(EDITOR_MESSAGES);
  const mac = useMemo(() => isMacPlatform(), []);
  // 開いた画像ごとに作り直される（呼び出し側が key を変える）ので、初期値は開いた時点のドキュメントで決める
  const [tool, setTool] = useState<Tool>(() => initialTool(state.doc));
  /** その場で文字を編集している注釈（ダブルクリック・Enter、またはテキスト・吹き出しを置いた直後） */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  // 前回選んだ線の太さ・文字サイズを、次に描く注釈の初期値にする
  // 記録は等倍の画面での値で持ち、使うときに画像の解像度の倍率を掛ける（別の解像度の画像でも同じ見た目になる）
  const [storedDefaults, setStoredDefaults] = useState<DrawDefaults>(() => loadDrawDefaults());
  const drawDefaults = useMemo(
    () => scaleDrawDefaults(storedDefaults, imageScale),
    [storedDefaults, imageScale],
  );
  // 自分で作った色のパレット（FR-EDIT-17）。ほかのタブで足した・外した色も受け取る
  const [colorPalette, setColorPalette] = useState<string[]>(() => loadColorPalette());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === COLOR_PALETTE_KEY) setColorPalette(loadColorPalette());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const changeColorPalette = useCallback((update: (prev: string[]) => string[]) => {
    setColorPalette((prev) => {
      const next = update(prev);
      saveColorPalette(next);
      return next;
    });
  }, []);
  const rememberDrawDefaults = useCallback(
    (patch: DrawDefaults) => {
      setStoredDefaults((prev) => {
        const next = { ...prev, ...unscaleDrawDefaults(patch, imageScale) };
        saveDrawDefaults(next);
        return next;
      });
    },
    [imageScale],
  );
  // マスクの範囲の下書きは履歴に入れ、足す・変える・消すを元に戻せるようにする
  const masks = state.masks;
  const setMasks = (next: readonly MaskDraft[]) => dispatch({ type: "masks", masks: next });
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
        setUnmaskError(m.appliedMask.error(e instanceof Error ? e.message : String(e)));
      } finally {
        setUnmasking(false);
      }
    },
    [onUnmask, m],
  );
  // 注釈を選んだら、適用済みのマスクの選択は外す（右の欄に出すのはどちらか一方）
  const hasSelection = state.selectedIds.length > 0;
  useEffect(() => {
    if (hasSelection) setSelectedMaskId(null);
  }, [hasSelection]);
  const canMask = onApplyMasks !== undefined;
  const canPickElement = elements.length > 0;
  const tools = useMemo<PaletteTool[]>(
    () =>
      TOOL_SHORTCUTS.filter(
        (t) => (canMask || t.tool !== "mask") && (canPickElement || t.tool !== "element"),
      ).map((t) => ({
        ...t,
        label: m.tools[t.tool],
      })),
    [canMask, canPickElement, m],
  );
  // 要素で囲む: 枠・番号・吹き出しを 1 回の操作で足す（元に戻すで一度に消せる）
  const padding = elementPadding(imageScale);
  const pickElement = useCallback(
    (element: PickableElement) => {
      const { ops, rectId } = elementStepOps(state.doc, element, {
        padding,
        calloutText: m.canvas.elementCallout(element.role, element.label),
        rectStyle: styleForNew("rect", drawDefaults),
        calloutStyle: styleForNew("callout", drawDefaults),
        badgeStyle: styleForNew("badge", drawDefaults),
      });
      dispatch({ type: "apply", ops, select: rectId });
    },
    [state.doc, padding, m, drawDefaults, dispatch],
  );
  // マスクの範囲を選んでいる間は注釈の選択を外す。右の欄の「削除」や Delete キーで、
  // マスクの範囲ではなく前に選んでいた注釈が消えてしまうのを防ぐ
  const selectTool = useCallback(
    (next: Tool) => {
      setTool(next);
      if (next === "mask") {
        dispatch({ type: "select", ids: [] });
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

  // キーボードのショートカット（FR-EDIT-12）。文字の入力中は効かせない
  useEffect(() => {
    const is = (e: KeyboardEvent, id: ShortcutId) => matchesShortcut(e, id, mac);
    const ids = state.selectedIds;
    const apply = (ops: unknown[], select?: readonly string[]) => {
      if (ops.length > 0) dispatch({ type: "apply", ops, ...(select ? { select } : {}) });
    };
    const reorder = (how: Reorder) => apply(reorderOps(state.doc, ids, how));
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.isComposing) return;
      const handled = () => e.preventDefault();
      if (is(e, "undo")) {
        handled();
        dispatch({ type: "undo" });
      } else if (is(e, "redo")) {
        handled();
        dispatch({ type: "redo" });
      } else if (is(e, "selectAll") && tool !== "mask") {
        // すべての注釈を選ぶ（FR-EDIT-11）
        handled();
        setSelectedMaskId(null);
        dispatch({ type: "select", ids: state.doc.annotations.map((a) => a.id) });
      } else if (is(e, "duplicate")) {
        // 何も選んでいなくても、ブラウザのブックマークにはしない
        handled();
        const picked = state.doc.annotations.filter((a) => ids.includes(a.id));
        if (picked.length === 0) return;
        const pasted = pasteOps(state.doc, picked);
        apply(pasted.ops, pasted.ids);
      } else if (is(e, "delete") && ids.length > 0) {
        handled();
        apply(removeOps(ids));
      } else if (is(e, "delete") && selectedMask !== undefined) {
        handled();
        if (!unmasking) void unmask(selectedMask.id);
      } else if ((is(e, "nudge") || is(e, "nudgeLarge")) && ids.length > 0) {
        handled();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        apply(moveOps(state.doc, ids, dx, dy));
      } else if ((is(e, "resize") || is(e, "resizeLarge")) && ids.length > 0) {
        handled();
        const step = e.shiftKey ? 10 : 1;
        const dw = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dh = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        apply(resizeOps(state.doc, ids, dw, dh));
      } else if (is(e, "editText") && ids.length === 1) {
        const target = state.doc.annotations.find((a) => a.id === ids[0]);
        if (target?.type === "text" || target?.type === "callout") {
          handled();
          setEditingId(target.id);
        }
      } else if (is(e, "bringToFront") && ids.length > 0) {
        handled();
        reorder("front");
      } else if (is(e, "sendToBack") && ids.length > 0) {
        handled();
        reorder("back");
      } else if (is(e, "bringForward") && ids.length > 0) {
        handled();
        reorder("forward");
      } else if (is(e, "sendBackward") && ids.length > 0) {
        handled();
        reorder("backward");
      } else if (is(e, "shortcuts") && onShowShortcuts !== undefined) {
        handled();
        onShowShortcuts();
      } else if (is(e, "deselect")) {
        setTool("select");
        dispatch({ type: "select", ids: [] });
        setSelectedMaskId(null);
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const t = tools.find((x) => x.key === e.key.toLowerCase());
        if (t !== undefined) selectTool(t.tool);
      }
    };
    // コピー・切り取り・貼り付けはクリップボードのイベントで受ける（画像の貼り付けは呼び出し側が受ける）
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (isTyping(e.target) || ids.length === 0 || e.clipboardData === null) return;
      // ページの文字を選んでいるときは、ブラウザの普通のコピーにする
      if ((window.getSelection()?.toString() ?? "") !== "") return;
      const picked = state.doc.annotations.filter((a) => ids.includes(a.id));
      e.preventDefault();
      e.clipboardData.setData(ANNOTATIONS_MIME, JSON.stringify(picked));
      // ほかのアプリには、注釈の文字を渡す
      e.clipboardData.setData(
        "text/plain",
        picked
          .flatMap((a) => (a.type === "text" || a.type === "callout" ? [a.text] : []))
          .join("\n"),
      );
      if (cut) apply(removeOps(ids));
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const raw = e.clipboardData?.getData(ANNOTATIONS_MIME) ?? "";
      if (raw === "") return;
      let parsed: ReturnType<typeof ClipboardSchema.safeParse>;
      try {
        parsed = ClipboardSchema.safeParse(JSON.parse(raw));
      } catch {
        return;
      }
      if (!parsed.success || parsed.data.length === 0) return;
      // 注釈を貼ったときは、画像の取り込み（呼び出し側の paste）を止める
      e.preventDefault();
      e.stopImmediatePropagation();
      const pasted = pasteOps(state.doc, parsed.data);
      apply(pasted.ops, pasted.ids);
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("copy", copy);
    window.addEventListener("cut", cut);
    // 画像の貼り付け（呼び出し側が window で受ける）より先に受けるため、capture で登録する
    window.addEventListener("paste", onPaste, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("copy", copy);
      window.removeEventListener("cut", cut);
      window.removeEventListener("paste", onPaste, { capture: true });
    };
  }, [
    dispatch,
    mac,
    onShowShortcuts,
    state.doc,
    state.selectedIds,
    tool,
    tools,
    selectTool,
    selectedMask,
    unmask,
    unmasking,
  ]);

  // 選んだ順ではなく、描いた順（重なりの下から）で並べる
  const selected = state.doc.annotations.filter((a) => state.selectedIds.includes(a.id));

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
              editingId={editingId}
              onEditingChange={setEditingId}
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
              {...(canPickElement
                ? { elements, elementPadding: padding, onPickElement: pickElement }
                : {})}
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
            onShowShortcuts={onShowShortcuts}
            actions={paletteActions}
          />
        </div>
        <aside className="harie-inspector" aria-label={m.inspector.label}>
          {onApplyMasks !== undefined && (tool === "mask" || masks.length > 0) && (
            <MaskPanel
              drafts={masks}
              onChange={setMasks}
              onCancel={cancelMasks}
              onApply={async () => {
                await onApplyMasks(toPiiMasks(masks));
                dispatch({ type: "masksApplied" });
                setTool("select");
              }}
            >
              {maskAside}
            </MaskPanel>
          )}
          {selected.length === 0 && selectedMask !== undefined ? (
            <section className="harie-inspector-body" aria-label={m.appliedMask.label}>
              <h2>{m.appliedMask.title(appliedMasks.indexOf(selectedMask) + 1)}</h2>
              <p className="harie-muted">{m.appliedMask.note}</p>
              <button
                type="button"
                disabled={unmasking}
                onClick={() => void unmask(selectedMask.id)}
              >
                {unmasking ? m.appliedMask.unmasking : m.appliedMask.unmask}
              </button>
              {unmaskError !== null && <p role="alert">{unmaskError}</p>}
            </section>
          ) : selected.length === 0 ? (
            tool !== "mask" && (
              <>
                <StepsCard doc={state.doc} dispatch={dispatch} drawDefaults={drawDefaults} />
                <EmptyInspector tools={tools} onShowShortcuts={onShowShortcuts} />
                {aside !== undefined && aside !== null && (
                  <div className="harie-inspector-extra">{aside}</div>
                )}
              </>
            )
          ) : (
            <Inspector
              // 選び直したら入力欄（文字・数値）を作り直す
              key={selected.map((a) => a.id).join(" ")}
              doc={state.doc}
              annotations={selected}
              dispatch={dispatch}
              onDrawDefaults={rememberDrawDefaults}
              scale={imageScale}
              colorPalette={colorPalette}
              onColorPalette={changeColorPalette}
            />
          )}
          {state.error !== null && <p role="alert">{state.error.message}</p>}
          {selected.length > 0 && (
            // 選んだ注釈の設定とは別の提案なので、欄の下端に区切って置く
            <div className="harie-inspector-foot">
              <StepsCard
                doc={state.doc}
                ids={state.selectedIds}
                dispatch={dispatch}
                drawDefaults={drawDefaults}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** 色を変えると何の色が変わるか（注釈の種類ごと） */
function colorLegend(m: EditorMessages, type: Annotation["type"]): string {
  if (type === "text") return m.inspector.colorText;
  if (type === "arrow") return m.inspector.colorLine;
  if (type === "badge") return m.inspector.colorBadge;
  return m.inspector.colorFrame;
}

/**
 * 番号・吹き出しのない枠に、まとめて付ける（FR-EDIT-14）。足りない枠があるときだけ出す。
 * `ids` を渡すと、選んだ枠だけを対象にする。足した番号・吹き出しを選んだ状態にし、1 回の操作として元に戻せる
 */
function StepsCard({
  doc,
  ids,
  dispatch,
  drawDefaults,
}: {
  doc: HarieDocument;
  ids?: readonly string[];
  dispatch: Dispatch<EditorAction>;
  drawDefaults: DrawDefaults;
}) {
  const m = useMessages(EDITOR_MESSAGES);
  const steps = useMemo(
    () =>
      completeSteps(doc, {
        ...(ids === undefined ? {} : { ids }),
        calloutText: m.canvas.newCallout,
        calloutStyle: styleForNew("callout", drawDefaults),
        badgeStyle: styleForNew("badge", drawDefaults),
      }),
    [doc, ids, m, drawDefaults],
  );
  if (steps.boxes === 0) return null;
  return (
    <section className="harie-steps" aria-label={m.steps.label}>
      <p>{ids === undefined ? m.steps.note(steps.boxes) : m.steps.noteSelected(steps.boxes)}</p>
      <button
        type="button"
        onClick={() => dispatch({ type: "apply", ops: steps.ops, select: steps.ids })}
      >
        <Icon size={16}>{TOOL_ICONS.badge}</Icon>
        {m.steps.add}
      </button>
    </section>
  );
}

/** 何も選んでいないとき。何ができるかと、道具のショートカットを案内する */
function EmptyInspector({
  tools,
  onShowShortcuts,
}: {
  tools: readonly PaletteTool[];
  onShowShortcuts: (() => void) | undefined;
}) {
  const m = useMessages(EDITOR_MESSAGES);
  return (
    <div className="harie-inspector-empty">
      <p>{m.inspector.empty}</p>
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
      {onShowShortcuts !== undefined && (
        <button type="button" className="harie-link-button" onClick={onShowShortcuts}>
          {m.shortcuts.openList}
          <kbd>?</kbd>
        </button>
      )}
    </div>
  );
}

/** 文字サイズを持つ注釈（番号の大きさも、右の欄では同じ「文字サイズ」として扱う） */
const hasFontSize = (a: Annotation) =>
  a.type === "text" || a.type === "callout" || a.type === "badge";
/** 線の太さ・線の種類を持つ注釈 */
const hasLine = (a: Annotation) => a.type === "rect" || a.type === "ellipse" || a.type === "arrow";
/** 色を変えたときに変わるスタイルの項目 */
const colorKey = (a: Annotation) => (a.type === "text" ? "color" : "stroke");

/** すべて同じ値ならその値、揃っていなければ undefined（混在） */
function common<T>(values: readonly T[]): T | undefined {
  const [first, ...rest] = values;
  return rest.every((v) => v === first) ? first : undefined;
}

/**
 * 選んだ注釈の設定。複数選んでいるときは、すべてに共通する項目だけを出し、選んだ値を全部に入れる
 * （FR-EDIT-11。値が揃っていなければ「混在」と示す）。どの変更も 1 回の操作として元に戻せる
 */
function Inspector({
  doc,
  annotations,
  dispatch,
  onDrawDefaults,
  scale,
  colorPalette,
  onColorPalette,
}: {
  doc: HarieDocument;
  annotations: readonly Annotation[];
  dispatch: Dispatch<EditorAction>;
  /** 選んだ線の太さ・文字サイズを、次に描く注釈の初期値として記録する */
  onDrawDefaults: (patch: DrawDefaults) => void;
  /** 画像の解像度の倍率。太さ・大きさの候補をこの倍率で出す（FR-EDIT-16） */
  scale: number;
  /** 自分で作った色（FR-EDIT-17。#RRGGBB、新しい順） */
  colorPalette: readonly string[];
  onColorPalette: (update: (prev: string[]) => string[]) => void;
}) {
  const m = useMessages(EDITOR_MESSAGES);
  const defaults = THEMES.default.defaults;
  const single = annotations.length === 1 ? annotations[0] : undefined;
  /** 値が変わる注釈だけに、スタイルの変更を入れる */
  const updateStyles = (patch: (a: Annotation) => Annotation["style"] | null) => {
    const ops = annotations.flatMap((a) => {
      const style = patch(a);
      return style === null ? [] : [{ op: "update", id: a.id, patch: { style } }];
    });
    if (ops.length > 0) dispatch({ type: "apply", ops });
  };
  const update = (a: Annotation, patch: Record<string, unknown>) =>
    dispatch({ type: "apply", ops: [{ op: "update", id: a.id, patch }] });

  const singleText = single?.type === "text" || single?.type === "callout" ? single : undefined;
  const annotationText = singleText?.text ?? "";
  const [text, setText] = useState(annotationText);
  // 編集面でのその場編集・元に戻すで文字が変わったら、入力欄も合わせる
  useEffect(() => setText(annotationText), [annotationText]);
  // 文字は 1 打鍵ごとではなく、入力欄を離れたときに 1 回の操作として確定する（元に戻す単位）
  const commitText = () => {
    if (singleText !== undefined && text !== singleText.text) update(singleText, { text });
  };

  const withFont = annotations.every(hasFontSize);
  const fontSize = common(annotations.map((a) => a.style?.fontSize ?? defaults.fontSize));
  const setFontSize = (v: number) => {
    const size = Math.round(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, v)));
    onDrawDefaults({
      ...(annotations.some((a) => a.type === "badge") ? { badgeFontSize: size } : {}),
      ...(annotations.some((a) => a.type !== "badge") ? { fontSize: size } : {}),
    });
    updateStyles((a) =>
      (a.style?.fontSize ?? defaults.fontSize) === size ? null : { ...a.style, fontSize: size },
    );
  };
  const withLine = annotations.every(hasLine);
  const strokeWidth = common(annotations.map((a) => a.style?.strokeWidth ?? defaults.strokeWidth));
  const setStrokeWidth = (v: number) => {
    const width = Math.round(Math.min(STROKE_WIDTH_MAX, Math.max(STROKE_WIDTH_MIN, v)));
    onDrawDefaults({ strokeWidth: width });
    updateStyles((a) =>
      (a.style?.strokeWidth ?? defaults.strokeWidth) === width
        ? null
        : { ...a.style, strokeWidth: width },
    );
  };
  const dash = common(annotations.map((a) => a.style?.dash ?? "solid"));
  const setDash = (v: LineDash) =>
    updateStyles((a) => {
      if ((a.style?.dash ?? "solid") === v) return null;
      // 実線は既定なので、フィールドごと外す
      const { dash: _, ...rest } = a.style ?? {};
      return v === "solid" ? rest : { ...rest, dash: v };
    });
  // 色を指定していない注釈は、テーマの既定の色を選んでいるものとして示す
  const color = common(
    annotations.map((a) => (a.style?.[colorKey(a)] ?? defaults[colorKey(a)]).toUpperCase()),
  );
  const setColor = (value: string) =>
    updateStyles((a) =>
      (a.style?.[colorKey(a)] ?? "").toUpperCase() === value.toUpperCase()
        ? null
        : { ...a.style, [colorKey(a)]: value },
    );
  const [pickerOpen, setPickerOpen] = useState(false);
  const type = common(annotations.map((a) => a.type));
  const summary = withLine
    ? m.inspector.summaryLine(strokeWidth, dash === undefined ? undefined : m.dashes[dash])
    : withFont
      ? m.inspector.summaryText(fontSize)
      : [...new Set(annotations.map((a) => m.types[a.type]))].join(m.inspector.listSeparator);
  const ids = annotations.map((a) => a.id);

  return (
    <div className="harie-inspector-body">
      <header className="harie-inspector-head">
        <span className="harie-inspector-type">
          <Icon size={16}>
            {type === undefined
              ? TOOL_ICONS.select
              : type in TOOL_ICONS
                ? TOOL_ICONS[type as Tool]
                : TOOL_ICONS.rect}
          </Icon>
        </span>
        <h2>
          {single === undefined ? m.inspector.multiple(annotations.length) : m.types[single.type]}
          <small>{summary}</small>
        </h2>
        <button
          type="button"
          className="harie-icon-button harie-inspector-delete"
          aria-label={single === undefined ? m.inspector.deleteAll : m.inspector.delete}
          title={m.inspector.deleteTitle("Delete")}
          onClick={() => dispatch({ type: "apply", ops: removeOps(ids) })}
        >
          <Icon size={16}>
            <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
          </Icon>
        </button>
      </header>
      {single?.status === "suggested" && (
        <div className="harie-suggestion-band">
          <span>{m.inspector.suggestion}</span>
          <p>
            <button
              type="button"
              className="harie-suggestion-adopt"
              onClick={() => dispatch({ type: "apply", ops: adoptSuggestionOps(doc, [single.id]) })}
            >
              {m.inspector.adopt}
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: "apply", ops: rejectSuggestionOps(doc, [single.id]) })
              }
            >
              {m.inspector.reject}
            </button>
          </p>
        </div>
      )}
      {singleText !== undefined && (
        <label className="harie-field">
          <span className="harie-field-label">{m.inspector.text}</span>
          <textarea
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
          />
        </label>
      )}
      {single?.type === "badge" && (
        <label className="harie-field">
          <span className="harie-field-label">{m.inspector.number}</span>
          <input
            type="number"
            className="harie-number"
            min={1}
            value={single.number}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              if (v > 0) update(single, { number: v });
            }}
          />
        </label>
      )}
      {withFont && (
        <SizeField
          legend={m.inspector.fontSize}
          options={FONT_SIZES.map((o) => ({
            label: m.fontSizes[o.name],
            value: Math.round(o.value * scale),
          }))}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          value={fontSize}
          onChange={setFontSize}
          sample={(_, i) => (
            <span className="harie-sample-text" style={{ fontSize: 11 + i * 4 }}>
              {m.inspector.sample}
            </span>
          )}
        />
      )}
      {withLine && (
        <SizeField
          legend={m.inspector.strokeWidth}
          options={STROKE_WIDTHS.map((o) => ({
            label: m.strokeWidths[o.name],
            value: Math.round(o.value * scale),
          }))}
          min={STROKE_WIDTH_MIN}
          max={STROKE_WIDTH_MAX}
          value={strokeWidth}
          onChange={setStrokeWidth}
          // 見本の太さは候補の順で決める（倍率を掛けた値だと太くなりすぎる）
          sample={(_, i) => (
            <span
              className="harie-sample-line"
              style={{ height: Math.max(1.5, (STROKE_WIDTHS[i]?.value ?? 4) * 0.8) }}
            />
          )}
        />
      )}
      {withLine && (
        <fieldset className="harie-field">
          <legend className="harie-field-label">
            {m.inspector.dash}
            {dash === undefined && <span className="harie-field-value">{m.inspector.mixed}</span>}
          </legend>
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
                <small>{m.dashes[d.value]}</small>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="harie-field">
        <legend className="harie-field-label">
          {type === undefined ? m.inspector.colorBadge : colorLegend(m, type)}
          {color === undefined && <span className="harie-field-value">{m.inspector.mixed}</span>}
        </legend>
        <div className="harie-swatches">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className="harie-swatch"
              aria-label={m.colors[c.name]}
              title={m.colors[c.name]}
              aria-pressed={color === c.value.toUpperCase()}
              style={{ background: c.value }}
              onClick={() => setColor(c.value)}
            />
          ))}
          {colorPalette.map((c) => (
            <button
              key={c}
              type="button"
              className="harie-swatch"
              aria-label={m.inspector.paletteColor(c)}
              title={c}
              aria-pressed={color === c}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <button
            type="button"
            className="harie-swatch harie-swatch-add"
            aria-label={m.inspector.addColor}
            title={m.inspector.addColor}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
          >
            <Icon size={16}>
              <path d="M12 5v14M5 12h14" />
            </Icon>
          </button>
        </div>
        {color !== undefined && colorPalette.includes(color) && (
          <button
            type="button"
            className="harie-link-button"
            onClick={() => onColorPalette((prev) => removePaletteColor(prev, color))}
          >
            {m.inspector.removeColor}
          </button>
        )}
        {pickerOpen && (
          <ColorPicker
            initial={color ?? defaults.stroke}
            onAdd={(value) => {
              onColorPalette((prev) => addPaletteColor(prev, value));
              setColor(value);
              setPickerOpen(false);
            }}
          />
        )}
      </fieldset>
    </div>
  );
}

/**
 * 新しい色を作る（FR-EDIT-17）。カラーピッカーかカラーコードで決め、「追加」でパレットに足して選んだ注釈に入れる。
 * ピッカーを動かすたびには注釈を変えない（元に戻す単位を 1 回にする）
 */
function ColorPicker({ initial, onAdd }: { initial: string; onAdd: (color: string) => void }) {
  const m = useMessages(EDITOR_MESSAGES);
  const start = normalizeHex(initial) ?? "#E5484D";
  const [value, setValue] = useState(start);
  const [code, setCode] = useState(start);
  const parsed = normalizeHex(code);
  const add = () => {
    if (parsed !== undefined) onAdd(parsed);
  };
  return (
    <div className="harie-color-picker">
      <input
        type="color"
        aria-label={m.inspector.pickColor}
        value={value.toLowerCase()}
        onChange={(e) => {
          const v = normalizeHex(e.target.value);
          if (v === undefined) return;
          setValue(v);
          setCode(v);
        }}
      />
      <input
        type="text"
        className="harie-color-code"
        aria-label={m.inspector.colorCode}
        aria-invalid={parsed === undefined}
        spellCheck={false}
        maxLength={7}
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          const v = normalizeHex(e.target.value);
          if (v !== undefined) setValue(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
      />
      <button
        type="button"
        className="harie-color-add"
        disabled={parsed === undefined}
        onClick={add}
      >
        {m.inspector.addToPalette}
      </button>
    </div>
  );
}

/**
 * 文字サイズ・線の太さ。仕上がりの見本のタイルから選ぶ。細かい値は「数値で指定」を開いて入れる
 * （入力欄を離れる・Enter で 1 回の操作として確定する）。候補にない値のときは最初から開いておく。
 * 複数選んでいて値が揃っていない（value が undefined）ときは「混在」と示し、選んだ値を全部に入れる
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
  value: number | undefined;
  onChange: (v: number) => void;
  sample: (option: { label: string; value: number }, index: number) => ReactNode;
}) {
  const m = useMessages(EDITOR_MESSAGES);
  const shown = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const [custom, setCustom] = useState(
    () => value !== undefined && !options.some((o) => o.value === value),
  );
  const commit = () => {
    const v = Number.parseFloat(draft);
    if (Number.isFinite(v) && v > 0) onChange(v);
    else setDraft(shown);
  };
  return (
    <fieldset className="harie-field">
      <legend className="harie-field-label">
        {legend}
        <span className="harie-field-value">
          {value === undefined ? m.inspector.mixed : `${value}px`}
        </span>
      </legend>
      <div className="harie-tiles">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            className="harie-tile"
            aria-label={o.label}
            aria-pressed={value === o.value}
            title={m.inspector.tileTitle(o.label, o.value)}
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
            aria-label={m.inspector.decrease(legend)}
            disabled={value === undefined || value <= min}
            onClick={() => value !== undefined && onChange(value - 1)}
          >
            −
          </button>
          <input
            type="number"
            aria-label={m.inspector.valuePx(legend)}
            min={min}
            max={max}
            step={1}
            value={draft}
            placeholder={value === undefined ? m.inspector.mixed : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
          />
          <span aria-hidden="true">px</span>
          <button
            type="button"
            aria-label={m.inspector.increase(legend)}
            disabled={value === undefined || value >= max}
            onClick={() => value !== undefined && onChange(value + 1)}
          >
            +
          </button>
        </span>
      ) : (
        <button type="button" className="harie-link-button" onClick={() => setCustom(true)}>
          {m.inspector.custom}
        </button>
      )}
    </fieldset>
  );
}
