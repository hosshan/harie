// 画像の仕上げ（FR-FILE-16）の選択肢。値は等倍の画面の px で持ち、画像の解像度（FR-EDIT-16）に合わせて大きくする
import type { Frame } from "@harie/model";

export const FRAME_PRESETS = ["none", "border", "shadow", "card"] as const;
export type FramePreset = (typeof FRAME_PRESETS)[number];
export type FrameBackground = "white" | "transparent";

const BORDER = "#D4D4D8";
const SHADOW = "#00000033";

/** 選択肢の仕上げ。`none` は undefined（仕上げを外す） */
export function framePreset(
  preset: FramePreset,
  scale: number,
  background: FrameBackground = "white",
): Frame | undefined {
  const s = (v: number) => Math.max(1, Math.round(v * scale));
  const bg = background === "transparent" ? { background: "transparent" as const } : {};
  switch (preset) {
    case "none":
      return undefined;
    case "border":
      return { border: { width: s(1), color: BORDER } };
    case "shadow":
      return { padding: s(32), ...bg, shadow: { blur: s(24), y: s(6), color: SHADOW } };
    case "card":
      return {
        padding: s(32),
        ...bg,
        radius: s(10),
        shadow: { blur: s(24), y: s(6), color: SHADOW },
      };
  }
}

/** 余白の色を、選択肢の値に読み替える（白以外の色は white 扱い） */
export function frameBackground(frame: Frame | undefined): FrameBackground {
  return frame?.background === "transparent" ? "transparent" : "white";
}

/**
 * 今の仕上げがどの選択肢か。AI・MCP で付けた独自の値なら null。
 * 余白の色は選択肢と別に選べるので、比べるときは外す
 */
export function matchFramePreset(frame: Frame | undefined, scale: number): FramePreset | null {
  if (frame === undefined) return "none";
  const background = frameBackground(frame);
  const target = JSON.stringify(normalize(frame));
  for (const p of FRAME_PRESETS) {
    const f = framePreset(p, scale, background);
    if (f !== undefined && JSON.stringify(normalize(f)) === target) return p;
  }
  return null;
}

function normalize(frame: Frame): Frame {
  const { background, ...rest } = frame;
  return background === undefined || background === "#FFFFFF" || background === "transparent"
    ? rest
    : frame;
}
