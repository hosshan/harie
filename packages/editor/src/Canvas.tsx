// 編集面。下層に buildSvg の SVG（保存時と同じ見た目、ADR-0005）、上層に操作用の SVG を重ねる
import { type Annotation, applyOps, type HarieDocument, type Point } from "@harie/model";
import { annotationBounds, buildSvg, layoutAnchors, THEMES } from "@harie/render";
import {
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type DrawDefaults, styleForNew } from "./draw-defaults";
import {
  boxFrom,
  contains,
  type Handle,
  handlePosition,
  handlesFor,
  resizePatch,
} from "./geometry";
import { type EditorAction, type EditorState, newAnnotationId } from "./history";
import { EDITOR_MESSAGES } from "./i18n/messages";
import { useMessages } from "./i18n/use-locale";
import { type AppliedMask, hitAppliedMask, type MaskDraft, maskRect } from "./masks";
import { annotationsInRect, mergeSelection, moveOps, toggleSelection } from "./selection";
import { recognizeSketch, type SketchShape } from "./sketch";
import { TextEditor } from "./TextEditor";

export type Tool =
  | "select"
  | "rect"
  | "ellipse"
  | "arrow"
  | "sketch"
  | "text"
  | "callout"
  | "badge"
  | "mask";

type Drag =
  /** 選んだ注釈をまとめて動かす */
  | { kind: "move"; ids: readonly string[]; start: Point; current: Point }
  | { kind: "resize"; id: string; handle: Handle; current: Point }
  | { kind: "create"; tool: "rect" | "ellipse" | "arrow"; start: Point; current: Point }
  /** 個人情報のマスク範囲。注釈ではないので履歴に積まず、onMaskDrawn で渡す */
  | { kind: "mask"; start: Point; current: Point }
  /** なぞった線。離したときに図形を読み取って注釈にする（FR-EDIT-13）。線そのものは残さない */
  | { kind: "sketch"; points: readonly Point[]; start: Point; current: Point }
  /** 何もない所からドラッグして、範囲に重なる注釈を選ぶ。base は Shift で足すときの元の選択 */
  | { kind: "marquee"; base: readonly string[]; start: Point; current: Point };

/** クリックだけで作ったときの大きさ（ドラッグが短すぎる場合） */
const DEFAULT_BOX = { w: 160, h: 80 };
const MIN_DRAG = 4;
/** なぞった線が図形にならなかったときの案内を出しておく時間 */
const SKETCH_MISS_MS = 2500;
/** 選択枠とつまみの色（ブランドの濃い黄土色。docs/brand/README.md） */
const SELECTION_COLOR = "#B0861A";

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 番号を置いた点の下にある枠（rect・ellipse）。あればその枠に紐付ける（ADR-0011） */
export function badgeAnchorAt(
  doc: HarieDocument,
  p: Point,
  tolerance: number,
): { anchor: { annotationId: string } } | Record<string, never> {
  const box = [...doc.annotations]
    .reverse()
    .find(
      (a) =>
        (a.type === "rect" || a.type === "ellipse") && contains(annotationBounds(a), p, tolerance),
    );
  return box === undefined ? {} : { anchor: { annotationId: box.id } };
}

/** 上に描かれているものから順に当たり判定する */
export function hitTest(doc: HarieDocument, p: Point, tolerance: number): Annotation | undefined {
  return [...doc.annotations].reverse().find((a) => {
    if (a.type === "arrow") return distanceToSegment(p, a.from, a.to) <= tolerance;
    return contains(annotationBounds(a), p, tolerance);
  });
}

/** 読み取った図形を、四角・楕円・矢印の注釈として追加する。線は矢じりのない矢印にする */
export function sketchOps(doc: HarieDocument, shape: SketchShape, defaults: DrawDefaults = {}) {
  const id = newAnnotationId(doc, shape.type);
  const style = {
    ...styleForNew(shape.type, defaults),
    ...(shape.type === "arrow" && shape.head === "none" ? { head: "none" } : {}),
  };
  const geometry =
    shape.type === "arrow"
      ? { from: shape.from, to: shape.to }
      : { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  const annotation = {
    id,
    type: shape.type,
    ...geometry,
    ...(Object.keys(style).length === 0 ? {} : { style }),
  };
  return [{ op: "add", annotation }];
}

function dragOps(doc: HarieDocument, drag: Drag, defaults: DrawDefaults = {}): unknown[] {
  if (drag.kind === "mask" || drag.kind === "marquee" || drag.kind === "sketch") return [];
  if (drag.kind === "move") {
    return moveOps(doc, drag.ids, drag.current.x - drag.start.x, drag.current.y - drag.start.y);
  }
  if (drag.kind === "create") {
    const id = newAnnotationId(doc, drag.tool);
    const style = styleForNew(drag.tool, defaults);
    const styled = style === undefined ? {} : { style };
    const short =
      Math.abs(drag.current.x - drag.start.x) < MIN_DRAG &&
      Math.abs(drag.current.y - drag.start.y) < MIN_DRAG;
    if (drag.tool === "arrow") {
      const to = short ? { x: drag.start.x + DEFAULT_BOX.w, y: drag.start.y } : drag.current;
      return [{ op: "add", annotation: { id, type: "arrow", from: drag.start, to, ...styled } }];
    }
    const box = short
      ? { x: Math.round(drag.start.x), y: Math.round(drag.start.y), ...DEFAULT_BOX }
      : boxFrom(drag.start, drag.current);
    return [{ op: "add", annotation: { id, type: drag.tool, ...box, ...styled } }];
  }
  const target = doc.annotations.find((a) => a.id === drag.id);
  if (target === undefined) return [];
  return [{ op: "update", id: drag.id, patch: resizePatch(target, drag.handle, drag.current) }];
}

/** 押した位置から動かしていない（クリックしただけ） */
function isClick(drag: { start: Point; current: Point }): boolean {
  return (
    Math.abs(drag.current.x - drag.start.x) < MIN_DRAG &&
    Math.abs(drag.current.y - drag.start.y) < MIN_DRAG
  );
}

function created(ops: unknown[]): string | undefined {
  const op = ops[0] as { op?: string; annotation?: { id?: string } } | undefined;
  return op?.op === "add" ? op.annotation?.id : undefined;
}

export type CanvasProps = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** ベース画像の URL。用意できるまでは undefined（注釈だけを描く） */
  baseImageUrl: string | undefined;
  tool: Tool;
  onToolDone: () => void;
  /** 適用前のマスク範囲（下書き）。上の SVG に描く */
  masks?: readonly MaskDraft[];
  onMaskDrawn?: (rect: { x: number; y: number; w: number; h: number }) => void;
  /** 適用済みで、まだ保存していないマスク。選択の道具で、注釈のない所をクリックすると選べる（ADR-0009） */
  appliedMasks?: readonly AppliedMask[];
  selectedAppliedMaskId?: string | null;
  onSelectAppliedMask?: (id: string | null) => void;
  /** 描いている・ドラッグしている間か（ツールのパレットを隠すのに使う） */
  onDraggingChange?: (dragging: boolean) => void;
  /** 新しく描く注釈の初期値（前回選んだ線の太さ・文字サイズ） */
  drawDefaults?: DrawDefaults;
  /**
   * その場で文字を編集している注釈（ダブルクリック・Enter、またはテキスト・吹き出しを置いた直後）。
   * 呼び出し側が持つときに渡す（Enter キーで編集を始めるため）。省略すると編集面の中で持つ
   */
  editingId?: string | null;
  onEditingChange?: (id: string | null) => void;
};

type TextAnnotation = Extract<Annotation, { type: "text" | "callout" }>;
const isText = (a: Annotation | undefined): a is TextAnnotation =>
  a?.type === "text" || a?.type === "callout";

export function Canvas({
  state,
  dispatch,
  baseImageUrl,
  tool,
  onToolDone,
  masks = [],
  onMaskDrawn,
  appliedMasks = [],
  selectedAppliedMaskId = null,
  onSelectAppliedMask,
  onDraggingChange,
  drawDefaults = {},
  editingId: controlledEditingId,
  onEditingChange,
}: CanvasProps) {
  const m = useMessages(EDITOR_MESSAGES);
  const overlay = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** その場で文字を編集している注釈（ダブルクリック、またはテキスト・吹き出しを置いた直後） */
  const [ownEditingId, setOwnEditingId] = useState<string | null>(null);
  const editingId = controlledEditingId === undefined ? ownEditingId : controlledEditingId;
  const controlled = controlledEditingId !== undefined;
  const setEditingId = useCallback(
    (id: string | null) => {
      if (!controlled) setOwnEditingId(id);
      onEditingChange?.(id);
    },
    [controlled, onEditingChange],
  );
  const { doc } = state;
  const { width, height } = doc.canvas;
  /** なぞった線が図形にならなかったことを、少しの間だけ知らせる */
  const [sketchMiss, setSketchMiss] = useState(false);
  useEffect(() => {
    if (!sketchMiss) return;
    const timer = setTimeout(() => setSketchMiss(false), SKETCH_MISS_MS);
    return () => clearTimeout(timer);
  }, [sketchMiss]);

  // ドラッグ中は履歴に積まずに途中経過だけを描く
  const display = useMemo(() => {
    if (drag === null || drag.kind === "mask" || drag.kind === "marquee" || drag.kind === "sketch")
      return doc;
    const r = applyOps(doc, dragOps(doc, drag, drawDefaults));
    return r.ok ? layoutAnchors(r.value) : doc;
  }, [doc, drag, drawDefaults]);
  const markup = useMemo(
    () =>
      buildSvg(display, {
        ...(baseImageUrl === undefined ? {} : { baseImageHref: baseImageUrl }),
        includeSuggested: true,
      }),
    [display, baseImageUrl],
  );

  // クリックしただけ（動かしていない）ではパレットを隠さない。ちらつかないように
  const moved =
    drag !== null &&
    (drag.kind === "resize" || drag.current.x !== drag.start.x || drag.current.y !== drag.start.y);
  useEffect(() => onDraggingChange?.(moved), [moved, onDraggingChange]);

  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const svg = overlay.current;
    const ctm = svg?.getScreenCTM();
    if (svg === null || ctm === null || ctm === undefined) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  /** 画面上の数 px を画像の座標に直す（拡大縮小しても掴みやすさを保つ） */
  const screenPx = (px: number) => {
    const rect = overlay.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return px;
    // 枠に合わせて縦横比を保って縮小されている（余白がある）ので、小さい方の倍率を使う
    return px / Math.min(rect.width / width, rect.height / height);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPoint(e);
    setSketchMiss(false);
    if (tool === "sketch") {
      setDrag({ kind: "sketch", points: [p], start: p, current: p });
      return;
    }
    if (tool === "mask") {
      setDrag({ kind: "mask", start: p, current: p });
      return;
    }
    if (tool === "rect" || tool === "ellipse" || tool === "arrow") {
      setDrag({ kind: "create", tool, start: p, current: p });
      return;
    }
    if (tool === "text" || tool === "callout" || tool === "badge") {
      const id = newAnnotationId(doc, tool);
      const style = styleForNew(tool, drawDefaults);
      const at = {
        x: Math.round(p.x),
        y: Math.round(p.y),
        ...(style === undefined ? {} : { style }),
      };
      const annotation =
        tool === "text"
          ? { id, type: "text", ...at, text: m.canvas.newText }
          : tool === "callout"
            ? { id, type: "callout", ...at, w: 240, text: m.canvas.newCallout }
            : {
                id,
                type: "badge",
                ...at,
                number: doc.annotations.filter((a) => a.type === "badge").length + 1,
                // 枠の上で置いたら枠に紐付け、枠の左上の外側に置く（ADR-0011）
                ...badgeAnchorAt(doc, p, screenPx(6)),
              };
      dispatch({ type: "apply", ops: [{ op: "add", annotation }], select: id });
      // 文字を置いたら、すぐに内容を打てるようにする
      if (tool !== "badge") {
        // 続く mousedown でフォーカスが編集面に移り、開いた入力欄が閉じないようにする
        e.preventDefault();
        setEditingId(id);
      }
      onToolDone();
      return;
    }
    const handle = (e.target as Element).getAttribute("data-handle") as Handle | null;
    const [only, ...others] = state.selectedIds;
    if (handle !== null && only !== undefined && others.length === 0) {
      setDrag({ kind: "resize", id: only, handle, current: p });
      return;
    }
    const hit = hitTest(doc, p, screenPx(6));
    if (hit === undefined) {
      // 何もない所: ドラッグで範囲選択。Shift を押していれば今の選択に足す（FR-EDIT-11）
      const base = e.shiftKey ? state.selectedIds : [];
      if (!e.shiftKey) dispatch({ type: "select", ids: [] });
      setDrag({ kind: "marquee", base, start: p, current: p });
      // 適用済みのマスクは、注釈のない所をクリックして選ぶ（注釈が重なっていれば注釈を優先する）
      onSelectAppliedMask?.(hitAppliedMask(appliedMasks, p)?.id ?? null);
      return;
    }
    onSelectAppliedMask?.(null);
    // Shift + クリックで選択に足す・外す。選んでいる注釈を掴んだら、選んでいるものをまとめて動かす
    const ids = e.shiftKey
      ? toggleSelection(state.selectedIds, hit.id)
      : state.selectedIds.includes(hit.id)
        ? state.selectedIds
        : [hit.id];
    dispatch({ type: "select", ids });
    if (ids.includes(hit.id)) setDrag({ kind: "move", ids, start: p, current: p });
  };

  // テキスト・吹き出しをダブルクリックすると、その場で文字を編集する（FR-EDIT-03）
  const onDoubleClick = (e: { clientX: number; clientY: number }) => {
    if (tool !== "select") return;
    const hit = hitTest(doc, toPoint(e), screenPx(6));
    if (!isText(hit)) return;
    dispatch({ type: "select", ids: [hit.id] });
    setEditingId(hit.id);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
    if (drag.kind === "sketch") {
      // 速く動かしたときに間引かれた点も拾う（対応していないブラウザでは今の点だけ）
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      const added = (events.length > 0 ? events : [e]).map(toPoint);
      setDrag({
        ...drag,
        points: [...drag.points, ...added],
        current: added[added.length - 1] ?? drag.current,
      });
      return;
    }
    setDrag({ ...drag, current: toPoint(e) });
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
    const final = { ...drag, current: toPoint(e) };
    setDrag(null);
    if (final.kind === "mask") {
      const rect = maskRect(final.start, final.current, doc.canvas);
      if (rect !== null) onMaskDrawn?.(rect);
      return;
    }
    if (final.kind === "sketch") {
      // なぞらずにクリックしただけなら、図形を選ぶ（何もない所なら選択を外す）。道具はスケッチのまま
      // 丸をなぞると始点に戻ってくるので、途中の点も含めて動いていないかを見る
      const tapped = [...final.points, final.current].every((q) =>
        isClick({ start: final.start, current: q }),
      );
      if (tapped) {
        const hit = hitTest(doc, final.current, screenPx(6));
        const ids =
          hit === undefined
            ? []
            : e.shiftKey
              ? toggleSelection(state.selectedIds, hit.id)
              : [hit.id];
        dispatch({ type: "select", ids });
        return;
      }
      const shape = recognizeSketch([...final.points, final.current], screenPx(12));
      if (shape === null) {
        setSketchMiss(true);
        return;
      }
      const ops = sketchOps(doc, shape, drawDefaults);
      const id = created(ops);
      // 続けてなぞれるよう、道具はスケッチのままにする
      dispatch({ type: "apply", ops, ...(id === undefined ? {} : { select: id }) });
      return;
    }
    if (final.kind === "marquee") {
      if (isClick(final)) return;
      const ids = annotationsInRect(doc, boxFrom(final.start, final.current));
      dispatch({ type: "select", ids: mergeSelection(final.base, ids) });
      if (ids.length > 0) onSelectAppliedMask?.(null);
      return;
    }
    if (final.kind === "move" && isClick(final)) return;
    const ops = dragOps(doc, final, drawDefaults);
    const id = created(ops);
    dispatch({ type: "apply", ops, ...(id === undefined ? {} : { select: id }) });
    if (final.kind === "create") onToolDone();
  };

  // 範囲選択の途中は、選ばれる注釈を先に示す
  const selectedIds =
    drag?.kind === "marquee" && !isClick(drag)
      ? mergeSelection(drag.base, annotationsInRect(doc, boxFrom(drag.start, drag.current)))
      : state.selectedIds;
  const selected = display.annotations.filter((a) => selectedIds.includes(a.id));
  const handleSize = screenPx(10);
  const editing = doc.annotations.find((a) => a.id === editingId);
  // 元に戻すなどで編集中の注釈がなくなったら、編集をやめる
  useEffect(() => {
    if (editingId !== null && !isText(editing)) setEditingId(null);
  }, [editingId, editing, setEditingId]);

  return (
    <div
      className="harie-canvas"
      style={
        {
          aspectRatio: `${width} / ${height}`,
          "--harie-canvas-ratio": width / height,
        } as CSSProperties
      }
    >
      {/* buildSvg の出力（エスケープ済みの SVG 文字列） */}
      <div
        className="harie-canvas-image"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: buildSvg が属性・本文をエスケープして生成する
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      <svg
        ref={overlay}
        className="harie-canvas-overlay"
        viewBox={`0 0 ${width} ${height}`}
        data-tool={tool}
        role="application"
        aria-label={m.canvas.label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <rect x={0} y={0} width={width} height={height} fill="transparent" />
        {display.annotations
          .filter((a) => a.status === "suggested")
          .map((a) => (
            <SuggestedOutline key={a.id} annotation={a} stroke={screenPx(1.5)} />
          ))}
        {appliedMasks.map((m) => (
          <AppliedMaskOutline
            key={m.id}
            id={m.id}
            rect={m.rect}
            selected={m.id === selectedAppliedMaskId}
            stroke={screenPx(1.5)}
          />
        ))}
        {masks.map((m, i) => (
          <MaskOutline key={m.id} rect={m.rect} label={String(i + 1)} stroke={screenPx(1.5)} />
        ))}
        {drag?.kind === "mask" && (
          <MaskOutline
            rect={maskRect(drag.start, drag.current, doc.canvas) ?? { x: 0, y: 0, w: 0, h: 0 }}
            label=""
            stroke={screenPx(1.5)}
          />
        )}
        {selected.map((a) => (
          <Selection
            key={a.id}
            annotation={a}
            handleSize={handleSize}
            stroke={screenPx(1.5)}
            // 大きさを変えるつまみは、1 つだけ選んでいるときに出す
            handles={selected.length === 1}
          />
        ))}
        {drag?.kind === "sketch" && (
          <polyline
            className="harie-sketch-trail"
            points={drag.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={THEMES.default.defaults.stroke}
            strokeOpacity={0.6}
            strokeWidth={drawDefaults.strokeWidth ?? THEMES.default.defaults.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
        {drag?.kind === "marquee" && !isClick(drag) && (
          <Marquee rect={boxFrom(drag.start, drag.current)} stroke={screenPx(1)} />
        )}
      </svg>
      {sketchMiss && (
        <p className="harie-sketch-miss" role="status">
          {m.canvas.sketchMiss}
        </p>
      )}
      {isText(editing) && (
        <TextEditor
          key={editing.id}
          annotation={editing}
          frame={frame()}
          onCommit={(text) => {
            setEditingId(null);
            if (text === editing.text) return;
            // 空にしたら注釈ごと消す（見えない注釈を残さない）
            const op =
              text.trim() === ""
                ? { op: "remove", id: editing.id }
                : { op: "update", id: editing.id, patch: { text } };
            dispatch({ type: "apply", ops: [op] });
          }}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );

  /** 画像の座標 → 編集面の要素内の画面座標（縦横比を保った余白を含む） */
  function frame() {
    const rect = overlay.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return { k: 1, ox: 0, oy: 0 };
    const k = Math.min(rect.width / width, rect.height / height);
    return { k, ox: (rect.width - width * k) / 2, oy: (rect.height - height * k) / 2 };
  }
}

/** 範囲選択の四角 */
function Marquee({
  rect,
  stroke,
}: {
  rect: { x: number; y: number; w: number; h: number };
  stroke: number;
}) {
  return (
    <rect
      className="harie-marquee"
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      fill="rgba(212, 167, 44, 0.12)"
      stroke={SELECTION_COLOR}
      strokeWidth={stroke}
      pointerEvents="none"
    />
  );
}

function Selection({
  annotation,
  handleSize,
  stroke,
  handles,
}: {
  annotation: Annotation;
  handleSize: number;
  stroke: number;
  handles: boolean;
}) {
  const b = annotationBounds(annotation);
  const pad = handleSize / 2;
  return (
    <g className="harie-selection" data-selected={annotation.id}>
      {annotation.type !== "arrow" && (
        <rect
          x={b.x - pad}
          y={b.y - pad}
          width={b.w + pad * 2}
          height={b.h + pad * 2}
          fill="none"
          stroke={SELECTION_COLOR}
          strokeWidth={stroke}
          strokeDasharray={`${stroke * 4} ${stroke * 3}`}
          pointerEvents="none"
        />
      )}
      {(handles ? handlesFor(annotation) : []).map((h) => {
        const p = handlePosition(annotation, b, h);
        return (
          <rect
            key={h}
            data-handle={h}
            x={p.x - handleSize / 2}
            y={p.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#FFFFFF"
            stroke={SELECTION_COLOR}
            strokeWidth={stroke}
            className={`harie-handle harie-handle-${h}`}
          />
        );
      })}
    </g>
  );
}

/** AI の提案（未採用）であることを示す枠。保存画像には描かれない編集用の表示（FR-AI-02） */
function SuggestedOutline({ annotation, stroke }: { annotation: Annotation; stroke: number }) {
  const b = annotationBounds(annotation);
  const pad = stroke * 3;
  return (
    <rect
      className="harie-suggested"
      data-suggested={annotation.id}
      x={b.x - pad}
      y={b.y - pad}
      width={b.w + pad * 2}
      height={b.h + pad * 2}
      fill="rgba(110, 86, 207, 0.08)"
      stroke="#6E56CF"
      strokeWidth={stroke}
      strokeDasharray={`${stroke * 2} ${stroke * 2}`}
      pointerEvents="none"
    />
  );
}

/** 適用済みで、まだ保存していないマスク（選んで外せる）。保存画像には描かれない編集用の表示 */
function AppliedMaskOutline({
  id,
  rect,
  selected,
  stroke,
}: {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  selected: boolean;
  stroke: number;
}) {
  return (
    <rect
      className="harie-mask-applied"
      data-applied-mask={id}
      data-selected={selected ? "true" : undefined}
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      fill="none"
      stroke={selected ? "#0B6BCB" : "#E5484D"}
      strokeOpacity={selected ? 1 : 0.6}
      strokeWidth={stroke * (selected ? 2 : 1)}
      strokeDasharray={selected ? undefined : `${stroke * 2} ${stroke * 2}`}
      pointerEvents="none"
    />
  );
}

/** 適用前のマスク範囲。保存画像には描かれない編集用の表示 */
function MaskOutline({
  rect,
  label,
  stroke,
}: {
  rect: { x: number; y: number; w: number; h: number };
  label: string;
  stroke: number;
}) {
  return (
    <g className="harie-mask-draft" pointerEvents="none">
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill="rgba(229, 72, 77, 0.25)"
        stroke="#E5484D"
        strokeWidth={stroke}
        strokeDasharray={`${stroke * 4} ${stroke * 3}`}
      />
      {label !== "" && (
        <text
          x={rect.x + stroke * 4}
          y={rect.y + stroke * 12}
          fontSize={stroke * 10}
          fill="#E5484D"
          fontWeight={700}
        >
          {label}
        </text>
      )}
    </g>
  );
}
