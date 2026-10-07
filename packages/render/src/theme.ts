// スタイルのプリセット（FR-EDIT-08 の土台）。注釈の style で個別に上書きできる
export type Theme = {
  defaults: { stroke: string; strokeWidth: number; color: string; fontSize: number };
  calloutFill: string;
  calloutRadius: number;
  badgeTextColor: string;
  spotlightOpacity: number;
};

export const THEMES: Record<string, Theme> & { default: Theme } = {
  default: {
    defaults: { stroke: "#E5484D", strokeWidth: 4, color: "#1C2024", fontSize: 24 },
    calloutFill: "#FFFFFF",
    calloutRadius: 8,
    badgeTextColor: "#FFFFFF",
    spotlightOpacity: 0.55,
  },
};
