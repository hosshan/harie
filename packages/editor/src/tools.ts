// 道具と、切り替える 1 文字のキー（FR-EDIT-12）。修飾キーなしで押す。Mac・Windows で同じ
import type { Tool } from "./Canvas";

export const TOOL_SHORTCUTS: readonly { tool: Tool; key: string }[] = [
  { tool: "select", key: "v" },
  { tool: "rect", key: "r" },
  { tool: "ellipse", key: "o" },
  { tool: "arrow", key: "a" },
  { tool: "sketch", key: "p" },
  { tool: "text", key: "t" },
  { tool: "callout", key: "c" },
  { tool: "badge", key: "n" },
  { tool: "mask", key: "m" },
];
