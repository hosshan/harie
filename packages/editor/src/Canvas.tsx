// 編集面。下層に buildSvg の SVG（保存時と同じ見た目、ADR-0005）、上層に操作用の SVG を重ねる
import { type Annotation, applyOps, type HarieDocument, type Point } from "@harie/model";
import { annotationBounds, buildSvg } from "@harie/render";
import { type Dispatch, type PointerEvent, useMemo, useRef, useState } from "react";
import {
  boxFrom,
  contains,
  type Handle,
  handlePosition,
  handlesFor,
  movePatch,
  resizePatch,
} from "./geometry";
import { type EditorAction, type EditorState, newAnnotationId } from "./history";
import { type MaskDraft, maskRect } from "./masks";

export type Tool = "select" | "rect" | "ellipse" | "arrow" | "text" | "callout" | "badge" | "mask";

type Drag =
  | { kind: "move"; id: string; start: Point; current: Point }
  | { kind: "resize"; id: string; handle: Handle; current: Point }
  | { kind: "create"; tool: "rect" | "ellipse" | "arrow"; start: Point; current: Point }
  /** 個人情報のマスク範囲。注釈ではないので履歴に積まず、onMaskDrawn で渡す */
  | { kind: "mask"; start: Point; current: Point };

/** クリックだけで作ったときの大きさ（ドラッグが短すぎる場合） */
const DEFAULT_BOX = { w: 160, h: 80 };
const MIN_DRAG = 4;

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 上に描かれているものから順に当たり判定する */
export function hitTest(doc: HarieDocument, p: Point, tolerance: number): Annotation | undefined {
  return [...doc.annotations].reverse().find((a) => {
    if (a.type === "arrow") return distanceToSegment(p, a.from, a.to) <= tolerance;
    return contains(annotationBounds(a), p, tolerance);
  });
}

function dragOps(doc: HarieDocument, drag: Drag): unknown[] {
  if (drag.kind === "mask") return [];
  if (drag.kind === "create") {
    const id = newAnnotationId(doc, drag.tool);
    const short =
      Math.abs(drag.current.x - drag.start.x) < MIN_DRAG &&
      Math.abs(drag.current.y - drag.start.y) < MIN_DRAG;
    if (drag.tool === "arrow") {
      const to = short ? { x: drag.start.x + DEFAULT_BOX.w, y: drag.start.y } : drag.current;
      return [{ op: "add", annotation: { id, type: "arrow", from: drag.start, to } }];
    }
    const box = short
      ? { x: Math.round(drag.start.x), y: Math.round(drag.start.y), ...DEFAULT_BOX }
      : boxFrom(drag.start, drag.current);
    return [{ op: "add", annotation: { id, type: drag.tool, ...box } }];
  }
  const target = doc.annotations.find((a) => a.id === drag.id);
  if (target === undefined) return [];
  const patch =
    drag.kind === "move"
      ? movePatch(target, drag.current.x - drag.start.x, drag.current.y - drag.start.y)
      : resizePatch(target, drag.handle, drag.current);
  return [{ op: "update", id: drag.id, patch }];
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
};

export function Canvas({
  state,
  dispatch,
  baseImageUrl,
  tool,
  onToolDone,
  masks = [],
  onMaskDrawn,
}: CanvasProps) {
  const overlay = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const { doc } = state;
  const { width, height } = doc.canvas;

  // ドラッグ中は履歴に積まずに途中経過だけを描く
  const display = useMemo(() => {
    if (drag === null || drag.kind === "mask") return doc;
    const r = applyOps(doc, dragOps(doc, drag));
    return r.ok ? r.value : doc;
  }, [doc, drag]);
  const markup = useMemo(
    () =>
      buildSvg(display, {
        ...(baseImageUrl === undefined ? {} : { baseImageHref: baseImageUrl }),
        includeSuggested: true,
      }),
    [display, baseImageUrl],
  );

  const toPoint = (e: PointerEvent): Point => {
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
      const at = { x: Math.round(p.x), y: Math.round(p.y) };
      const annotation =
        tool === "text"
          ? { id, type: "text", ...at, text: "テキスト" }
          : tool === "callout"
            ? { id, type: "callout", ...at, w: 240, text: "説明文を入力" }
            : {
                id,
                type: "badge",
                ...at,
                number: doc.annotations.filter((a) => a.type === "badge").length + 1,
              };
      dispatch({ type: "apply", ops: [{ op: "add", annotation }], select: id });
      onToolDone();
      return;
    }
    const handle = (e.target as Element).getAttribute("data-handle") as Handle | null;
    if (handle !== null && state.selectedId !== null) {
      setDrag({ kind: "resize", id: state.selectedId, handle, current: p });
      return;
    }
    const hit = hitTest(doc, p, screenPx(6));
    dispatch({ type: "select", id: hit?.id ?? null });
    if (hit !== undefined) setDrag({ kind: "move", id: hit.id, start: p, current: p });
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
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
    if (
      final.kind === "move" &&
      final.current.x === final.start.x &&
      final.current.y === final.start.y
    ) {
      return;
    }
    const ops = dragOps(doc, final);
    const id = created(ops);
    dispatch({ type: "apply", ops, ...(id === undefined ? {} : { select: id }) });
    if (final.kind === "create") onToolDone();
  };

  const selected = display.annotations.find((a) => a.id === state.selectedId);
  const handleSize = screenPx(10);

  return (
    <div className="harie-canvas" style={{ aspectRatio: `${width} / ${height}` }}>
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
        aria-label="注釈の編集面"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <rect x={0} y={0} width={width} height={height} fill="transparent" />
        {display.annotations
          .filter((a) => a.status === "suggested")
          .map((a) => (
            <SuggestedOutline key={a.id} annotation={a} stroke={screenPx(1.5)} />
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
        {selected !== undefined && (
          <Selection annotation={selected} handleSize={handleSize} stroke={screenPx(1.5)} />
        )}
      </svg>
    </div>
  );
}

function Selection({
  annotation,
  handleSize,
  stroke,
}: {
  annotation: Annotation;
  handleSize: number;
  stroke: number;
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
          stroke="#0B6BCB"
          strokeWidth={stroke}
          strokeDasharray={`${stroke * 4} ${stroke * 3}`}
          pointerEvents="none"
        />
      )}
      {handlesFor(annotation).map((h) => {
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
            stroke="#0B6BCB"
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
