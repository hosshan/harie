// 自分で作った色のパレット（FR-EDIT-17）。図を変えても使えるように、このブラウザの localStorage にだけ置く
// 引数名を storage にしない（Chrome 拡張の WXT が wxt/utils/storage を自動で import してしまう）
import { StyleSchema } from "@harie/model";

export const COLOR_PALETTE_KEY = "harie.colorPalette";
/** パレットに残す色の数。超えたら古いものから外す */
export const COLOR_PALETTE_MAX = 12;

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/** 注釈の色と同じ検証（#RRGGBB / #RRGGBBAA）。パレットには不透明の #RRGGBB だけを置く */
const ColorListSchema = StyleSchema.shape.stroke.unwrap().array();

function browserStorage(): KeyValueStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // 無効にされている・サンドボックスの中など。記録しないだけで、色は選べる
    return undefined;
  }
}

/** 入力された色を `#RRGGBB`（大文字）にそろえる。`#` なし・3 桁の短縮も受け付け、色でなければ undefined */
export function normalizeHex(input: string): string | undefined {
  let v = input.trim();
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) v = `#${[...v.slice(1)].map((c) => c + c).join("")}`;
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : undefined;
}

/** 記録したパレットを読む。壊れた値・色でない値は無視する */
export function loadColorPalette(store = browserStorage()): string[] {
  try {
    const raw = store?.getItem(COLOR_PALETTE_KEY);
    if (raw === null || raw === undefined) return [];
    const parsed = ColorListSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    const colors = parsed.data.flatMap((c) => normalizeHex(c) ?? []);
    return [...new Set(colors)].slice(0, COLOR_PALETTE_MAX);
  } catch {
    return [];
  }
}

export function saveColorPalette(colors: readonly string[], store = browserStorage()): void {
  try {
    store?.setItem(COLOR_PALETTE_KEY, JSON.stringify(colors));
  } catch {
    // 容量超過・無効など。記録できなくても編集は続けられる
  }
}

/** 色をパレットの先頭に足す（すでにあれば先頭へ移す）。上限を超えた古い色は外す */
export function addPaletteColor(colors: readonly string[], color: string): string[] {
  const hex = normalizeHex(color);
  if (hex === undefined) return [...colors];
  return [hex, ...colors.filter((c) => c !== hex)].slice(0, COLOR_PALETTE_MAX);
}

export function removePaletteColor(colors: readonly string[], color: string): string[] {
  const hex = normalizeHex(color);
  return colors.filter((c) => c !== hex);
}
