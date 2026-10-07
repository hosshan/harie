// 注釈ドキュメント → SVG（ADR-0005）
// 純粋関数。エディタの表示と保存時のラスタライズの両方がこの SVG を使い、見た目を一致させる。
import type { Annotation, AnoiDocument, Style } from "@anoi/model";
import { THEMES, type Theme } from "./theme";

export const FONT_FAMILY = "Noto Sans JP";

export type BuildSvgOptions = {
  /** ベース画像の data URI。省略すると注釈だけの透明な SVG になる（エディタのオーバーレイ用）。 */
  baseImageHref?: string;
  /** AI 提案中（status: "suggested"）の注釈も描くか。保存時は描かない（FR-AI-02）。 */
  includeSuggested?: boolean;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 数値を SVG に書く。小数は 2 桁に丸め、出力を安定させる（スナップショット・決定性のため）。 */
function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

function attrs(a: Record<string, string | number | undefined>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${typeof v === "number" ? n(v) : esc(v as string)}"`)
    .join(" ");
}

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

function arrow(a: Extract<Annotation, { type: "arrow" }>, s: Resolved): string {
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

function annotation(
  a: Annotation,
  theme: Theme,
  doc: AnoiDocument,
  baseImageHref: string | undefined,
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
      const pad = s.fontSize * 0.6;
      const lines = wrapText(a.text, s.fontSize, a.w - pad * 2);
      const h = pad * 2 + s.fontSize * (1 + (lines.length - 1) * LINE_HEIGHT);
      return `<g ${attrs(common)}><rect ${attrs({ x: a.x, y: a.y, width: a.w, height: h, rx: s.radius ?? theme.calloutRadius, fill: s.fill ?? theme.calloutFill, stroke: s.stroke, "stroke-width": Math.max(1, s.strokeWidth / 2) })}/>${textLines(lines, a.x + pad, a.y + pad, s)}</g>`;
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

export function buildSvg(doc: AnoiDocument, options: BuildSvgOptions = {}): string {
  const theme = THEMES[doc.theme.preset] ?? THEMES.default;
  const { width, height, crop } = doc.canvas;
  const view = crop ?? { x: 0, y: 0, w: width, h: height };
  const body = doc.annotations
    .filter((a) => options.includeSuggested || a.status !== "suggested")
    .map((a) => annotation(a, theme, doc, options.baseImageHref))
    .join("");
  const base =
    options.baseImageHref === undefined
      ? ""
      : `<image ${attrs({ href: options.baseImageHref, x: 0, y: 0, width, height, preserveAspectRatio: "none" })}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attrs({ width: view.w, height: view.h, viewBox: `${n(view.x)} ${n(view.y)} ${n(view.w)} ${n(view.h)}` })}>${base}${body}</svg>`;
}
