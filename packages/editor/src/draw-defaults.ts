// 次に描く注釈の初期値（前回選んだ線の太さ・文字サイズ・番号の大きさ）。このブラウザの localStorage にだけ置く
// 引数名を storage にしない（Chrome 拡張の WXT が wxt/utils/storage を自動で import してしまう）
import { type Style, StyleSchema } from "@harie/model";
import { THEMES } from "@harie/render";

/** 番号の大きさは文字サイズと別に持つ（吹き出しを大きくしても番号は大きくしない） */
export type DrawDefaults = { strokeWidth?: number; fontSize?: number; badgeFontSize?: number };

export const DRAW_DEFAULTS_KEY = "harie.drawDefaults";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

const DrawDefaultsSchema = StyleSchema.pick({ strokeWidth: true, fontSize: true }).extend({
  badgeFontSize: StyleSchema.shape.fontSize,
});

function browserStorage(): KeyValueStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // 無効にされている・サンドボックスの中など。記録しないだけで、描くことはできる
    return undefined;
  }
}

/** 記録した初期値を読む。壊れた・知らない値は無視する */
export function loadDrawDefaults(store = browserStorage()): DrawDefaults {
  try {
    const raw = store?.getItem(DRAW_DEFAULTS_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed = DrawDefaultsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return {};
    const { strokeWidth, fontSize, badgeFontSize } = parsed.data;
    return {
      ...(strokeWidth === undefined ? {} : { strokeWidth }),
      ...(fontSize === undefined ? {} : { fontSize }),
      ...(badgeFontSize === undefined ? {} : { badgeFontSize }),
    };
  } catch {
    return {};
  }
}

export function saveDrawDefaults(defaults: DrawDefaults, store = browserStorage()): void {
  try {
    store?.setItem(DRAW_DEFAULTS_KEY, JSON.stringify(defaults));
  } catch {
    // 容量超過・無効など。記録できなくても編集は続けられる
  }
}

/** 新しく描く注釈に付ける style。線の太さは四角・楕円・矢印、文字サイズはテキスト・吹き出し、番号の大きさは番号に使う */
export function styleForNew(type: string, defaults: DrawDefaults): Style | undefined {
  const value =
    type === "rect" || type === "ellipse" || type === "arrow"
      ? { strokeWidth: defaults.strokeWidth }
      : type === "text" || type === "callout"
        ? { fontSize: defaults.fontSize }
        : type === "badge"
          ? { fontSize: defaults.badgeFontSize }
          : {};
  const style = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
  return Object.keys(style).length === 0 ? undefined : style;
}

/**
 * 記録した初期値（等倍の画面での値）を、画像の解像度の倍率に合わせる（FR-EDIT-16）。
 * 倍率が 1 なら記録のまま（未記録はテーマの既定に任せる）。1 より大きいときは、未記録の項目もテーマの既定に倍率を掛けて埋める
 */
export function scaleDrawDefaults(defaults: DrawDefaults, scale: number): DrawDefaults {
  if (!(scale > 1)) return defaults;
  const base = THEMES.default.defaults;
  return {
    strokeWidth: Math.round((defaults.strokeWidth ?? base.strokeWidth) * scale),
    fontSize: Math.round((defaults.fontSize ?? base.fontSize) * scale),
    badgeFontSize: Math.round((defaults.badgeFontSize ?? base.fontSize) * scale),
  };
}

/** 画像のピクセルで選んだ値を、記録する値（等倍の画面での値）に戻す。別の解像度の画像でも同じ見た目になる */
export function unscaleDrawDefaults(patch: DrawDefaults, scale: number): DrawDefaults {
  if (!(scale > 1)) return patch;
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [k, Math.round((v / scale) * 100) / 100]),
  ) as DrawDefaults;
}
