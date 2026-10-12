// 注釈ドキュメント → SVG（ADR-0005）
// 純粋関数。エディタの表示と保存時のラスタライズの両方がこの SVG を使い、見た目を一致させる。
import type { Annotation, HarieDocument, Style } from "@harie/model";
import { THEMES, type Theme } from "./theme";
import { attrs, esc, n } from "./xml";

export const FONT_FAMILY = "Noto Sans JP";

export type BuildSvgOptions = {
  /** ベース画像の data URI。省略すると注釈だけの透明な SVG になる（エディタのオーバーレイ用）。 */
  baseImageHref?: string;
  /** AI 提案中（status: "suggested"）の注釈も描くか。保存時は描かない（FR-AI-02）。 */
  includeSuggested?: boolean;
};

type Resolved = {
  stroke: string;
  strokeWidth: number;
  color: string;
  fontSize: number;
  fill?: string | undefined;
  radius?: number | undefined;
  opacity?: number | undefined;
  fontWeight?: "normal" | "bold" | undefined;
  head?: "end" | "both" | "none" | undefined;
};

function resolve(theme: Theme, a: Annotation): Resolved {
  const st: Style = a.style ?? {};
  return {
    stroke: st.stroke ?? theme.defaults.stroke,
    strokeWidth: st.strokeWidth ?? theme.defaults.strokeWidth,
    color: st.color ?? theme.defaults.color,
    fontSize: st.fontSize ?? theme.defaults.fontSize,
    fill: st.fill,
    radius: st.radius,
    opacity: st.opacity,
    fontWeight: st.fontWeight,
    head: st.head,
  };
}

/** 等幅でないフォントの幅を厳密には測れないため、全角 1em・半角 0.6em で見積もる。 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) > 0xff ? 1 : 0.6;
  return w * fontSize;
}

/** 幅 maxWidth に収まるよう、文字単位で折り返す（日本語は単語区切りがないため）。 */
export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const ch of paragraph) {
      if (line !== "" && estimateTextWidth(line + ch, fontSize) > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += ch;
    }
    lines.push(line);
  }
  return lines;
}

const LINE_HEIGHT = 1.4;
/** ベースラインの位置（em）。上端揃えにするための近似値。 */
const ASCENT = 0.88;

function textLines(
  lines: string[],
  x: number,
  top: number,
  s: Resolved,
  extra: Record<string, string> = {},
) {
  return lines
    .map(
      (line, i) =>
        `<text ${attrs({
          x,
          y: top + s.fontSize * (ASCENT + i * LINE_HEIGHT),
          "font-family": FONT_FAMILY,
          "font-size": s.fontSize,
          "font-weight": s.fontWeight === "bold" ? 700 : 400,
          fill: s.color,
          ...extra,
        })}>${esc(line)}</text>`,
    )
    .join("");
}

/** 吹き出しの折り返しと高さ。描画と当たり判定で同じ値を使う。 */
function calloutLayout(a: Extract<Annotation, { type: "callout" }>, s: Resolved) {
  const pad = s.fontSize * 0.6;
  const lines = wrapText(a.text, s.fontSize, a.w - pad * 2);
  return { pad, lines, h: pad * 2 + s.fontSize * (1 + (lines.length - 1) * LINE_HEIGHT) };
}

type Point = { x: number; y: number };

function arrow(a: { from: Point; to: Point }, s: Resolved): string {
  const dx = a.to.x - a.from.x;
  const dy = a.to.y - a.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const head = Math.min(s.strokeWidth * 4, len / 2);
  const headMode = s.head ?? "end";
  const tip = (p: { x: number; y: number }, dir: number) => {
    const bx = p.x - dir * ux * head;
    const by = p.y - dir * uy * head;
    const half = head * 0.6;
    return `<polygon ${attrs({
      points: [
        `${n(p.x)},${n(p.y)}`,
        `${n(bx - uy * half)},${n(by + ux * half)}`,
        `${n(bx + uy * half)},${n(by - ux * half)}`,
      ].join(" "),
      fill: s.stroke,
    })}/>`;
  };
  const endInset = headMode === "none" ? 0 : head * 0.8;
  const startInset = headMode === "both" ? head * 0.8 : 0;
  const line = `<line ${attrs({
    x1: a.from.x + ux * startInset,
    y1: a.from.y + uy * startInset,
    x2: a.to.x - ux * endInset,
    y2: a.to.y - uy * endInset,
    stroke: s.stroke,
    "stroke-width": s.strokeWidth,
    "stroke-linecap": "round",
  })}/>`;
  return (
    line + (headMode !== "none" ? tip(a.to, 1) : "") + (headMode === "both" ? tip(a.from, -1) : "")
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 吹き出しから anchor の注釈へ引く線（矢印）。`side` は配置の目安で、線は実際の位置関係から決める。
 * 離れている向き（横・縦）の向かい合う辺どうしを結び、範囲が重なる向きでは重なりの中央でまっすぐ引く。
 * 重なっている・近すぎるときは引かない。
 */
export function calloutConnector(
  callout: Bounds,
  target: Bounds,
): { from: Point; to: Point } | null {
  const c = callout;
  const t = target;
  const gapX = Math.max(t.x - (c.x + c.w), c.x - (t.x + t.w), 0);
  const gapY = Math.max(t.y - (c.y + c.h), c.y - (t.y + t.h), 0);
  if (gapX === 0 && gapY === 0) return null;
  // 交差軸の位置: 範囲が重なれば重なりの中央、重ならなければ相手に近い端
  const cross = (c0: number, c1: number, t0: number, t1: number) => {
    const lo = Math.max(c0, t0);
    const hi = Math.min(c1, t1);
    if (lo <= hi) return { c: (lo + hi) / 2, t: (lo + hi) / 2 };
    return { c: clamp((t0 + t1) / 2, c0, c1), t: clamp((c0 + c1) / 2, t0, t1) };
  };
  if (gapX >= gapY) {
    const right = c.x >= t.x + t.w;
    const y = cross(c.y, c.y + c.h, t.y, t.y + t.h);
    return {
      from: { x: right ? c.x : c.x + c.w, y: y.c },
      to: { x: right ? t.x + t.w : t.x, y: y.t },
    };
  }
  const below = c.y >= t.y + t.h;
  const x = cross(c.x, c.x + c.w, t.x, t.x + t.w);
  return {
    from: { x: x.c, y: below ? c.y : c.y + c.h },
    to: { x: x.t, y: below ? t.y + t.h : t.y },
  };
}

function annotation(
  a: Annotation,
  theme: Theme,
  doc: HarieDocument,
  baseImageHref: string | undefined,
  visible: ReadonlyMap<string, Annotation>,
): string {
  const s = resolve(theme, a);
  const common = { opacity: s.opacity };
  switch (a.type) {
    case "rect":
      return `<rect ${attrs({ x: a.x, y: a.y, width: a.w, height: a.h, rx: s.radius, fill: s.fill ?? "none", stroke: s.stroke, "stroke-width": s.strokeWidth, ...common })}/>`;
    case "ellipse":
      return `<ellipse ${attrs({ cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: a.w / 2, ry: a.h / 2, fill: s.fill ?? "none", stroke: s.stroke, "stroke-width": s.strokeWidth, ...common })}/>`;
    case "arrow":
      return `<g ${attrs(common)}>${arrow(a, s)}</g>`;
    case "text":
      return `<g ${attrs(common)}>${textLines(a.text.split("\n"), a.x, a.y, s)}</g>`;
    case "callout": {
      const { pad, lines, h } = calloutLayout(a, s);
      const target = a.anchor === undefined ? undefined : visible.get(a.anchor.annotationId);
      const link =
        target === undefined || target.id === a.id
          ? null
          : calloutConnector({ x: a.x, y: a.y, w: a.w, h }, annotationBounds(target, theme));
      // 線は吹き出しの下に描き、枠の縁から出ているように見せる
      const connector =
        link === null ||
        Math.hypot(link.to.x - link.from.x, link.to.y - link.from.y) < s.strokeWidth * 2
          ? ""
          : arrow(link, { ...s, head: "end" });
      return `<g ${attrs(common)}>${connector}<rect ${attrs({ x: a.x, y: a.y, width: a.w, height: h, rx: s.radius ?? theme.calloutRadius, fill: s.fill ?? theme.calloutFill, stroke: s.stroke, "stroke-width": Math.max(1, s.strokeWidth / 2) })}/>${textLines(lines, a.x + pad, a.y + pad, s)}</g>`;
    }
    case "badge": {
      const r = s.fontSize * 0.8;
      return `<g ${attrs(common)}><circle ${attrs({ cx: a.x + r, cy: a.y + r, r, fill: s.fill ?? s.stroke })}/>${textLines([String(a.number)], a.x + r, a.y + r - s.fontSize / 2, { ...s, color: theme.badgeTextColor, fontWeight: "bold" }, { "text-anchor": "middle" })}</g>`;
    }
    case "spotlight": {
      const { width: W, height: H } = doc.canvas;
      const d = `M0 0H${n(W)}V${n(H)}H0Z M${n(a.x)} ${n(a.y)}V${n(a.y + a.h)}H${n(a.x + a.w)}V${n(a.y)}Z`;
      return `<path ${attrs({ d, fill: "#000000", "fill-rule": "evenodd", opacity: s.opacity ?? theme.spotlightOpacity })}/>`;
    }
    case "blur": {
      // 可逆なぼかし（PII 用ではない。ADR-0007）。ベース画像の該当範囲をぼかした複製で覆う。
      // モザイクは SVG で表現できないため、MVP では強めのぼかしで代替する
      if (baseImageHref === undefined) {
        return `<rect ${attrs({ x: a.x, y: a.y, width: a.w, height: a.h, fill: "#888888" })}/>`;
      }
      const id = `blur-${a.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const sigma = Math.max(4, Math.min(a.w, a.h) / (a.method === "mosaic" ? 6 : 10));
      return `<clipPath id="${id}-clip"><rect ${attrs({ x: a.x, y: a.y, width: a.w, height: a.h })}/></clipPath><filter id="${id}-f" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox"><feGaussianBlur stdDeviation="${n(sigma)}" edgeMode="duplicate"/></filter><g clip-path="url(#${id}-clip)"><image ${attrs({ href: baseImageHref, x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height, preserveAspectRatio: "none", filter: `url(#${id}-f)` })}/></g>`;
    }
  }
}

export type Bounds = { x: number; y: number; w: number; h: number };

/**
 * 注釈が描かれる範囲。エディタの選択枠・当たり判定に使う。
 * 描画（`annotation()`）と同じ寸法の計算を使い、表示とずれないようにする。
 */
export function annotationBounds(a: Annotation, theme: Theme = THEMES.default): Bounds {
  const s = resolve(theme, a);
  switch (a.type) {
    case "rect":
    case "ellipse":
    case "spotlight":
    case "blur":
      return { x: a.x, y: a.y, w: a.w, h: a.h };
    case "arrow": {
      const x = Math.min(a.from.x, a.to.x);
      const y = Math.min(a.from.y, a.to.y);
      return { x, y, w: Math.abs(a.to.x - a.from.x), h: Math.abs(a.to.y - a.from.y) };
    }
    case "text": {
      const lines = a.text.split("\n");
      const w = Math.max(...lines.map((l) => estimateTextWidth(l, s.fontSize)));
      return { x: a.x, y: a.y, w, h: s.fontSize * (1 + (lines.length - 1) * LINE_HEIGHT) };
    }
    case "callout":
      return { x: a.x, y: a.y, w: a.w, h: calloutLayout(a, s).h };
    case "badge": {
      const r = s.fontSize * 0.8;
      return { x: a.x, y: a.y, w: r * 2, h: r * 2 };
    }
  }
}

export function buildSvg(doc: HarieDocument, options: BuildSvgOptions = {}): string {
  const theme = THEMES[doc.theme.preset] ?? THEMES.default;
  const { width, height, crop } = doc.canvas;
  const view = crop ?? { x: 0, y: 0, w: width, h: height };
  const shown = doc.annotations.filter((a) => options.includeSuggested || a.status !== "suggested");
  const visible = new Map(shown.map((a) => [a.id, a]));
  const body = shown.map((a) => annotation(a, theme, doc, options.baseImageHref, visible)).join("");
  const base =
    options.baseImageHref === undefined
      ? ""
      : `<image ${attrs({ href: options.baseImageHref, x: 0, y: 0, width, height, preserveAspectRatio: "none" })}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attrs({ width: view.w, height: view.h, viewBox: `${n(view.x)} ${n(view.y)} ${n(view.w)} ${n(view.h)}` })}>${base}${body}</svg>`;
}
