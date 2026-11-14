// 画像の仕上げ（FR-FILE-16）の部品。枠線・影・角丸をそれぞれ付け外しでき、組み合わせられる。
// 値は等倍の画面の px で持ち、画像の解像度（FR-EDIT-16）に合わせて大きくする。
// 選ぶ手間を増やさないよう、余白の色は選ばせず透明にする（PNG では透過、JPEG では白になる）
import type { Frame } from "@harie/model";

export const FRAME_PARTS = ["border", "shadow", "radius"] as const;
export type FramePart = (typeof FRAME_PARTS)[number];

const BORDER = "#D4D4D8";
const SHADOW = "#00000033";

/** 今の仕上げに、どの部品が付いているか。AI・MCP で付けた独自の値も、付いていれば付いている扱い */
export function frameParts(frame: Frame | undefined): Record<FramePart, boolean> {
  return {
    border: frame?.border !== undefined,
    shadow: frame?.shadow !== undefined && frame.shadow.blur > 0,
    radius: (frame?.radius ?? 0) > 0,
  };
}

/**
 * 部品を 1 つ付け外しした仕上げ。ほかの部品の値（独自の値を含む）はそのまま残す。
 * 何も付いていなくなったら undefined（仕上げを外す）
 */
export function toggleFramePart(
  frame: Frame | undefined,
  part: FramePart,
  scale: number,
): Frame | undefined {
  const s = (v: number) => Math.max(1, Math.round(v * scale));
  const on = !frameParts(frame)[part];
  const next: Frame = { ...frame };
  switch (part) {
    case "border":
      if (on) next.border = { width: s(1), color: BORDER };
      else delete next.border;
      break;
    case "radius":
      if (on) next.radius = s(10);
      else delete next.radius;
      break;
    case "shadow":
      if (on) {
        next.shadow = { blur: s(24), y: s(6), color: SHADOW };
        // 影は余白がないと見えない。余白がなければ透明の余白を足す
        if ((next.padding ?? 0) === 0) {
          next.padding = s(32);
          next.background ??= "transparent";
        }
      } else {
        delete next.shadow;
        // 影のためだけの透明な余白は、影と一緒に外す
        if (next.background === "transparent") {
          delete next.padding;
          delete next.background;
        }
      }
      break;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}
