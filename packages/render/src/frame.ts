// 保存する画像の仕上げ（FR-FILE-16 / ADR-0017）。画像のまわりに余白・背景・影・線・角丸を付ける。
// 注釈の座標は変えず、描いた画像（buildSvg の出力）を外側の SVG で包む
import { type Frame, type HarieDocument, outputSize as modelOutputSize } from "@harie/model";
import type { Bounds } from "./svg";
import { attrs, n } from "./xml";

/** 省略を埋めた仕上げ */
export type ResolvedFrame = {
  padding: number;
  /** null は透過（PNG のときだけ。JPEG では白になる） */
  background: string | null;
  radius: number;
  border: { width: number; color: string } | null;
  shadow: { blur: number; y: number; color: string; opacity: number } | null;
};

const DEFAULT_BORDER = "#D4D4D8";
const DEFAULT_SHADOW = "#00000040";

/** `#RRGGBBAA` を色と不透明度に分ける（SVG の fill と fill-opacity） */
function splitAlpha(color: string): { color: string; opacity: number } {
  if (color.length === 9) {
    return { color: color.slice(0, 7), opacity: Number.parseInt(color.slice(7), 16) / 255 };
  }
  return { color, opacity: 1 };
}

/** 仕上げの省略を埋める。何も付かない仕上げ（余白・線・角丸・影がない）は null */
export function resolveFrame(frame: Frame | undefined): ResolvedFrame | null {
  if (frame === undefined) return null;
  const padding = frame.padding ?? 0;
  const radius = frame.radius ?? 0;
  const border =
    frame.border === undefined
      ? null
      : { width: frame.border.width, color: frame.border.color ?? DEFAULT_BORDER };
  const shadow =
    frame.shadow === undefined || frame.shadow.blur === 0
      ? null
      : {
          blur: frame.shadow.blur,
          y: frame.shadow.y ?? frame.shadow.blur / 4,
          ...splitAlpha(frame.shadow.color ?? DEFAULT_SHADOW),
        };
  if (padding === 0 && radius === 0 && border === null && shadow === null) return null;
  const background = frame.background === "transparent" ? null : (frame.background ?? "#FFFFFF");
  return { padding, background, radius, border, shadow };
}

/** 画像として見える範囲（切り抜いていればその範囲）。注釈の座標 */
function viewOf(doc: HarieDocument): Bounds {
  const { width, height, crop } = doc.canvas;
  return crop ?? { x: 0, y: 0, w: width, h: height };
}

/**
 * 保存する画像が写す範囲を、注釈の座標（画像のピクセル）で返す。仕上げの余白の分だけ画像より広い。
 * ページ上の画像に注釈の位置を重ねるとき（Chrome 拡張）に使う
 */
export function outputArea(doc: HarieDocument): Bounds {
  const view = viewOf(doc);
  const p = resolveFrame(doc.frame)?.padding ?? 0;
  return { x: view.x - p, y: view.y - p, w: view.w + 2 * p, h: view.h + 2 * p };
}

/**
 * 書き出しの大きさ（FR-EDIT-24）の、画像（表示範囲）に対する倍率。仕上げの値（画像のピクセル）はこの倍率で縮めて描く（ADR-0018）。
 * 縦横で違うときは小さいほう
 */
export function outputScale(doc: HarieDocument): number {
  const view = viewOf(doc);
  const out = modelOutputSize(doc);
  return Math.min(out.width / view.w, out.height / view.h);
}

/** 仕上げの値を倍率で縮める・広げる */
export function scaleFrame(f: ResolvedFrame, k: number): ResolvedFrame {
  if (k === 1) return f;
  return {
    ...f,
    padding: f.padding * k,
    radius: f.radius * k,
    border: f.border === null ? null : { ...f.border, width: f.border.width * k },
    shadow: f.shadow === null ? null : { ...f.shadow, blur: f.shadow.blur * k, y: f.shadow.y * k },
  };
}

/** 保存する画像の大きさ（px）。書き出しの大きさ（FR-EDIT-24）に、同じ倍率で縮めた仕上げの余白を足す */
export function savedImageSize(doc: HarieDocument): { width: number; height: number } {
  const out = modelOutputSize(doc);
  const p = (resolveFrame(doc.frame)?.padding ?? 0) * outputScale(doc);
  return { width: out.width + 2 * p, height: out.height + 2 * p };
}

/** 仕上げで、画像の下に敷くもの（背景・影）と上に重ねるもの（線）、画像の切り抜き */
type FrameLayers = { defs: string; under: string; over: string; clip: string | null };

function layers(f: ResolvedFrame, view: Bounds, ids: { shadow: string; clip: string }) {
  const p = f.padding;
  const W = view.w + 2 * p;
  const H = view.h + 2 * p;
  const image = { x: p, y: p, width: view.w, height: view.h };
  const rx = f.radius > 0 ? f.radius : undefined;
  let defs = "";
  let under = "";
  let over = "";
  if (f.background !== null)
    under += `<rect ${attrs({ width: W, height: H, fill: f.background })}/>`;
  if (f.shadow !== null) {
    // CSS の box-shadow の blur は、ガウスぼかしの標準偏差の約 2 倍
    defs += `<filter ${attrs({ id: ids.shadow, filterUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H })}><feGaussianBlur ${attrs({ stdDeviation: n(f.shadow.blur / 2) })}/></filter>`;
    under += `<rect ${attrs({ ...image, y: p + f.shadow.y, rx, fill: f.shadow.color, "fill-opacity": n(f.shadow.opacity), filter: `url(#${ids.shadow})` })}/>`;
  }
  // 透過の PNG をベースにしても、画像の部分は保存時と同じく白地にする
  under += `<rect ${attrs({ ...image, rx, fill: "#FFFFFF" })}/>`;
  let clip: string | null = null;
  if (rx !== undefined) {
    defs += `<clipPath ${attrs({ id: ids.clip })}><rect ${attrs({ ...image, rx })}/></clipPath>`;
    clip = ids.clip;
  }
  if (f.border !== null) {
    // 線は画像の縁の内側に引く（余白がなくても見え、画像の大きさを変えない）
    const w = Math.min(f.border.width, view.w / 2, view.h / 2);
    over += `<rect ${attrs({
      x: n(p + w / 2),
      y: n(p + w / 2),
      width: n(view.w - w),
      height: n(view.h - w),
      rx: rx === undefined ? undefined : n(Math.max(0, f.radius - w / 2)),
      fill: "none",
      stroke: f.border.color,
      "stroke-width": n(w),
    })}/>`;
  }
  return { defs, under, over, clip } satisfies FrameLayers;
}

/**
 * 描いた画像の SVG（buildSvg の出力の中身）を仕上げで包む。
 * `inner` は `x`, `y`, `width`, `height` の属性を受け取って、画像の部分の `<svg>` を返す関数
 */
export function wrapFrame(
  f: ResolvedFrame,
  view: Bounds,
  inner: (place: { x: number; y: number }) => string,
): string {
  const p = f.padding;
  const W = view.w + 2 * p;
  const H = view.h + 2 * p;
  const l = layers(f, view, { shadow: "harie-frame-shadow", clip: "harie-frame-clip" });
  const image = inner({ x: p, y: p });
  const body = l.clip === null ? image : `<g clip-path="url(#${l.clip})">${image}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attrs({ width: W, height: H, viewBox: `0 0 ${n(W)} ${n(H)}` })}>${l.defs === "" ? "" : `<defs>${l.defs}</defs>`}${l.under}${body}${l.over}</svg>`;
}

/**
 * エディタで仕上げを見せるための SVG。`under` は画像の下に敷く背景・影、`over` は画像の上に重ねる線。
 * どちらも余白を含む大きさで、画像を表示している要素の外側へ余白の分だけはみ出して重ねる。
 * 角丸は表示側で画像を切り抜く。仕上げがなければ null
 */
export function buildFramePreview(
  doc: HarieDocument,
): { under: string; over: string | null; frame: ResolvedFrame } | null {
  const f = resolveFrame(doc.frame);
  if (f === null) return null;
  const view = viewOf(doc);
  const W = view.w + 2 * f.padding;
  const H = view.h + 2 * f.padding;
  // エディタでは同じページに複数の SVG が並ぶので、保存用と別の id にする
  const l = layers(f, view, {
    shadow: "harie-frame-preview-shadow",
    clip: "harie-frame-preview-clip",
  });
  const svg = (content: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" ${attrs({ width: W, height: H, viewBox: `0 0 ${n(W)} ${n(H)}`, preserveAspectRatio: "none" })}>${content}</svg>`;
  return {
    under: svg(`${l.defs === "" ? "" : `<defs>${l.defs}</defs>`}${l.under}`),
    over: l.over === "" ? null : svg(l.over),
    frame: f,
  };
}
