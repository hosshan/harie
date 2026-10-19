// ベース画像の差し替え（FR-EDIT-10）。注釈を引き継ぎ、新しい画像の大きさに合わせる
import type { Annotation, HarieDocument, PiiApplied, Rect, Style } from "@harie/model";
import { layoutAnchors } from "./svg";
import { THEMES, type Theme } from "./theme";

export type RebaseResult = {
  doc: HarieDocument;
  /**
   * 元の画像にかけていた個人情報のマスク（新しい画像の座標に直したもの）。
   * 新しい画像にはかかっていないので、ドキュメントの記録からは外す。かけ直す範囲の候補に使う
   */
  previousPii: PiiApplied[];
};

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * 注釈を残したまま、ベース画像を別の大きさ（同じでもよい）の画像に差し替えたドキュメントを返す。
 * 大きさが違うときは、位置と大きさを縦横それぞれの比率で、線の太さ・文字の大きさは小さい方の比率で拡大縮小する。
 * 省略していた線の太さ・文字の大きさは既定値を書き込んでから拡大縮小し、見た目の比率を保つ。
 * PII 加工の記録は元の画像のものなので外す（ADR-0007。新しい画像は加工していない）。
 */
export function rebaseDocument(
  doc: HarieDocument,
  size: { width: number; height: number },
  theme?: Theme,
): RebaseResult {
  const { width, height } = doc.canvas;
  const sx = size.width / width;
  const sy = size.height / height;
  const rect = (r: Rect): Rect => ({
    x: round(r.x * sx),
    y: round(r.y * sy),
    w: round(r.w * sx),
    h: round(r.h * sy),
  });
  const previousPii = doc.pii.applied.map((p) => ({ ...p, rect: rect(p.rect) }));
  const canvas = {
    ...doc.canvas,
    width: size.width,
    height: size.height,
    crop: doc.canvas.crop === null ? null : rect(doc.canvas.crop),
  };
  const pii = { ...doc.pii, applied: [] };
  if (sx === 1 && sy === 1) return { doc: { ...doc, canvas, pii }, previousPii };

  const th = theme ?? THEMES[doc.theme.preset] ?? THEMES.default;
  const s = Math.min(sx, sy);
  const style = (st: Style | undefined): Style => ({
    ...st,
    strokeWidth: round((st?.strokeWidth ?? th.defaults.strokeWidth) * s),
    fontSize: round((st?.fontSize ?? th.defaults.fontSize) * s),
    ...(st?.radius === undefined ? {} : { radius: round(st.radius * s) }),
  });
  const point = (p: { x: number; y: number }) => ({ x: round(p.x * sx), y: round(p.y * sy) });
  const scale = (a: Annotation): Annotation => {
    const common = { style: style(a.style) };
    switch (a.type) {
      case "rect":
      case "ellipse":
      case "spotlight":
      case "blur":
        return { ...a, ...common, ...rect(a) };
      case "arrow":
        return { ...a, ...common, from: point(a.from), to: point(a.to) };
      case "callout":
        return { ...a, ...common, ...point(a), w: Math.max(1, round(a.w * sx)) };
      case "text":
      case "badge":
        return { ...a, ...common, ...point(a) };
    }
  };
  const next = { ...doc, canvas, pii, annotations: doc.annotations.map(scale) };
  // 紐付けた番号は、拡大縮小した枠から位置を計算し直す（ADR-0011）
  return { doc: layoutAnchors(next, th), previousPii };
}
