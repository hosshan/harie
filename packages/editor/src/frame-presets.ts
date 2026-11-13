// 画像の仕上げ（FR-FILE-16）の選択肢。値は等倍の画面の px で持ち、画像の解像度（FR-EDIT-16）に合わせて大きくする。
// 選ぶ手間を増やさないよう、余白の色は選ばせず透明にする（PNG では透過、JPEG では白になる）
import type { Frame } from "@harie/model";

export const FRAME_PRESETS = ["none", "border", "shadow", "card"] as const;
export type FramePreset = (typeof FRAME_PRESETS)[number];

const BORDER = "#D4D4D8";
const SHADOW = "#00000033";

/** 選択肢の仕上げ。`none` は undefined（仕上げを外す） */
export function framePreset(preset: FramePreset, scale: number): Frame | undefined {
  const s = (v: number) => Math.max(1, Math.round(v * scale));
  const shadow = { blur: s(24), y: s(6), color: SHADOW };
  switch (preset) {
    case "none":
      return undefined;
    case "border":
      return { border: { width: s(1), color: BORDER } };
    case "shadow":
      return { padding: s(32), background: "transparent", shadow };
    case "card":
      return { padding: s(32), background: "transparent", radius: s(10), shadow };
  }
}

/** 今の仕上げがどの選択肢か。AI・MCP で付けた独自の値なら null（どれも選ばれていない表示にする） */
export function matchFramePreset(frame: Frame | undefined, scale: number): FramePreset | null {
  if (frame === undefined) return "none";
  const target = JSON.stringify(frame);
  return FRAME_PRESETS.find((p) => JSON.stringify(framePreset(p, scale)) === target) ?? null;
}
