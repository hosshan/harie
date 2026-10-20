// 枠に番号と吹き出しをまとめて付ける（FR-EDIT-14）。AI を使わず、枠の位置と描いた順だけで決める。
// 吹き出しの置き方は AI の提案（packages/ai の suggest.ts）と同じ `placeCallout` を使う
import type { Annotation, HarieDocument, Style } from "@harie/model";
import { annotationBounds, type Bounds, badgeAnchorPosition } from "./svg";
import { THEMES, type Theme } from "./theme";

type Size = { w: number; h: number };
type Canvas = { width: number; height: number };
export type CalloutSide = "top" | "right" | "bottom" | "left";

/** 吹き出しと枠の間 */
const CALLOUT_GAP = 16;
/** 紐付けていない番号・吹き出しでも、枠からこの距離（画像のピクセル）までにあれば「付いている」とみなす */
const NEAR_BADGE = 40;
const NEAR_CALLOUT = 48;

/** 吹き出しの幅。画像が大きいほど広くする */
export function calloutWidth(canvas: { width: number }): number {
  return Math.max(200, Math.min(360, Math.round(canvas.width * 0.2)));
}

const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 2 つの範囲の間の距離。重なっていれば 0 */
function distance(a: Bounds, b: Bounds): number {
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.hypot(gapX, gapY);
}

/**
 * 枠の右 → 左 → 下 → 上の順に、画像に収まり `obstacles` に重ならない位置へ吹き出しを置く。
 * どこも重なるときは画像に収まる最初の位置、どこにも収まらないときは上。side は枠から見た吹き出しの向き。
 */
export function placeCallout(
  target: Bounds,
  size: Size,
  canvas: Canvas,
  obstacles: readonly Bounds[] = [],
): { x: number; y: number; side: CalloutSide } {
  const gap = CALLOUT_GAP;
  const clampY = (y: number) => Math.max(0, Math.min(canvas.height - size.h, y));
  const clampX = (x: number) => Math.max(0, Math.min(canvas.width - size.w, x));
  const top = {
    x: clampX(target.x),
    y: Math.max(0, target.y - gap - size.h),
    side: "top" as const,
  };
  const candidates = [
    {
      x: target.x + target.w + gap,
      y: clampY(target.y),
      side: "right" as const,
      fits: target.x + target.w + gap + size.w <= canvas.width,
    },
    {
      x: target.x - gap - size.w,
      y: clampY(target.y),
      side: "left" as const,
      fits: target.x - gap - size.w >= 0,
    },
    {
      x: clampX(target.x),
      y: target.y + target.h + gap,
      side: "bottom" as const,
      fits: target.y + target.h + gap + size.h <= canvas.height,
    },
    { ...top, fits: target.y - gap - size.h >= 0 },
  ].filter((c) => c.fits);
  const free = candidates.find(
    (c) => !obstacles.some((o) => overlaps({ x: c.x, y: c.y, w: size.w, h: size.h }, o)),
  );
  const { x, y, side } = free ?? candidates[0] ?? top;
  return { x, y, side };
}

/** 番号と吹き出しを付ける対象になる枠（四角・楕円）。提案中のものは除く */
export function isStepBox(a: Annotation): boolean {
  return (a.type === "rect" || a.type === "ellipse") && a.status !== "suggested";
}

export type CompleteStepsOptions = {
  /** 対象にする枠の id。省略するとすべての枠 */
  ids?: readonly string[];
  /** 新しい吹き出しの文字 */
  calloutText: string;
  calloutStyle?: Style | undefined;
  badgeStyle?: Style | undefined;
  theme?: Theme;
};

export type CompleteStepsResult = {
  /** `applyOps` に渡す追加の操作 */
  ops: { op: "add"; annotation: Annotation }[];
  /** 新しく足した注釈の id（番号・吹き出しの順） */
  ids: string[];
  /** 番号か吹き出しを足した枠の数 */
  boxes: number;
};

/**
 * 番号・吹き出しが付いていない枠に、それを足す操作を作る（FR-EDIT-14）。
 * - 付いているかどうか: その枠に紐付けた番号・吹き出しがあるか、紐付けていないものが枠のすぐ近くにあるか。
 *   番号と吹き出しは別々に判定し、足りない方だけを足す。
 * - 番号: 今ある番号の最大の次から、枠を描いた順（重なりの下から）に振る。枠に紐付け、左上の外側に置く（ADR-0011）。
 * - 吹き出し: 枠に紐付け（矢印で枠を指す）、ほかの注釈や先に置いた吹き出しに重ならない側に置く。
 */
export function completeSteps(
  doc: HarieDocument,
  options: CompleteStepsOptions,
): CompleteStepsResult {
  const theme = options.theme ?? THEMES[doc.theme.preset] ?? THEMES.default;
  const committed = doc.annotations.filter((a) => a.status !== "suggested");
  const boxes = committed.filter(
    (a) => isStepBox(a) && (options.ids === undefined || options.ids.includes(a.id)),
  );
  const taken = new Set(doc.annotations.map((a) => a.id));
  const newId = (type: string) => {
    let n = doc.annotations.length + 1;
    while (taken.has(`${type}-${n}`)) n++;
    taken.add(`${type}-${n}`);
    return `${type}-${n}`;
  };
  let number = Math.max(0, ...committed.flatMap((a) => (a.type === "badge" ? [a.number] : [])));
  // 吹き出しを重ねない相手。番号・吹き出しを足すたびに増やす
  const obstacles = committed
    .filter((a) => a.type !== "spotlight")
    .map((a) => annotationBounds(a, theme));
  const width = calloutWidth(doc.canvas);
  const result: CompleteStepsResult = { ops: [], ids: [], boxes: 0 };
  const add = (annotation: Annotation) => {
    result.ops.push({ op: "add", annotation });
    result.ids.push(annotation.id);
    obstacles.push(annotationBounds(annotation, theme));
  };

  for (const box of boxes) {
    const bounds = annotationBounds(box, theme);
    const near = (a: Annotation, type: "badge" | "callout", within: number) => {
      if (a.type !== type || (a.type !== "badge" && a.type !== "callout")) return false;
      return a.anchor === undefined
        ? distance(annotationBounds(a, theme), bounds) <= within
        : a.anchor.annotationId === box.id;
    };
    const hasBadge = committed.some((a) => near(a, "badge", NEAR_BADGE));
    const hasCallout = committed.some((a) => near(a, "callout", NEAR_CALLOUT));
    if (hasBadge && hasCallout) continue;
    result.boxes++;
    if (!hasBadge) {
      const draft = {
        id: newId("badge"),
        type: "badge" as const,
        x: 0,
        y: 0,
        number: ++number,
        anchor: { annotationId: box.id },
        ...(options.badgeStyle === undefined ? {} : { style: options.badgeStyle }),
      };
      const p = badgeAnchorPosition(draft, box, theme);
      add({ ...draft, x: Math.round(p.x), y: Math.round(p.y) });
    }
    if (!hasCallout) {
      const draft = {
        id: newId("callout"),
        type: "callout" as const,
        x: 0,
        y: 0,
        w: width,
        text: options.calloutText,
        ...(options.calloutStyle === undefined ? {} : { style: options.calloutStyle }),
      };
      const size = annotationBounds(draft, theme);
      const at = placeCallout(bounds, size, doc.canvas, obstacles);
      add({
        ...draft,
        x: Math.round(at.x),
        y: Math.round(at.y),
        anchor: { annotationId: box.id, side: at.side },
      });
    }
  }
  return result;
}
