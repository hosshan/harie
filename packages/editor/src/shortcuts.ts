// キーボードのショートカット（FR-EDIT-12）。Mac は ⌘、Windows / Linux は Ctrl を使い、表示も OS に合わせる。
// 定義はここに集め、キーの判定・ボタンの title・ショートカット一覧が同じ定義を使う
export type KeyCombo = {
  /** KeyboardEvent.key（英字は小文字）。記号のキーは code で判定する（Shift で key が変わるため） */
  key?: string;
  /** KeyboardEvent.code（"BracketRight" など） */
  code?: string;
  /** Mac は ⌘、ほかは Ctrl */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Shift を見ない（"?" のように、Shift を押して入力する記号） */
  anyShift?: boolean;
};

export type ShortcutId =
  | "save"
  | "open"
  | "copyImage"
  | "undo"
  | "redo"
  | "selectAll"
  | "deselect"
  | "delete"
  | "duplicate"
  | "copy"
  | "cut"
  | "paste"
  | "nudge"
  | "nudgeLarge"
  | "resize"
  | "resizeLarge"
  | "editText"
  | "bringForward"
  | "sendBackward"
  | "bringToFront"
  | "sendToBack"
  | "shortcuts";

/** 先頭が表示に使う組み合わせ。ほかは同じ操作の別のキー */
export const SHORTCUTS: Record<ShortcutId, readonly KeyCombo[]> = {
  save: [{ key: "s", mod: true }],
  open: [{ key: "o", mod: true }],
  // 描いた画像をクリップボードへ（注釈のコピー ⌘C と分ける）
  copyImage: [{ key: "c", mod: true, shift: true }],
  undo: [{ key: "z", mod: true }],
  redo: [
    { key: "z", mod: true, shift: true },
    { key: "y", mod: true },
  ],
  selectAll: [{ key: "a", mod: true }],
  deselect: [{ key: "Escape" }],
  delete: [{ key: "Delete" }, { key: "Backspace" }],
  duplicate: [{ key: "d", mod: true }],
  copy: [{ key: "c", mod: true }],
  cut: [{ key: "x", mod: true }],
  paste: [{ key: "v", mod: true }],
  nudge: [{ key: "ArrowUp" }, { key: "ArrowDown" }, { key: "ArrowLeft" }, { key: "ArrowRight" }],
  nudgeLarge: [
    { key: "ArrowUp", shift: true },
    { key: "ArrowDown", shift: true },
    { key: "ArrowLeft", shift: true },
    { key: "ArrowRight", shift: true },
  ],
  // 右・下で大きく、左・上で小さく（左上は動かさない）
  resize: [
    { key: "ArrowRight", mod: true },
    { key: "ArrowLeft", mod: true },
    { key: "ArrowDown", mod: true },
    { key: "ArrowUp", mod: true },
  ],
  resizeLarge: [
    { key: "ArrowRight", mod: true, shift: true },
    { key: "ArrowLeft", mod: true, shift: true },
    { key: "ArrowDown", mod: true, shift: true },
    { key: "ArrowUp", mod: true, shift: true },
  ],
  editText: [{ key: "Enter" }],
  bringForward: [{ code: "BracketRight", mod: true }],
  sendBackward: [{ code: "BracketLeft", mod: true }],
  bringToFront: [{ code: "BracketRight", mod: true, shift: true }],
  sendToBack: [{ code: "BracketLeft", mod: true, shift: true }],
  shortcuts: [
    { key: "?", anyShift: true },
    { code: "Slash", mod: true },
  ],
};

type NavigatorWithUaData = Navigator & { userAgentData?: { platform?: string } };

/** Mac（iPad を含む）か。⌘ を使うかどうかを決める */
export function isMacPlatform(nav: Navigator | undefined = globalThis.navigator): boolean {
  if (nav === undefined) return false;
  const platform =
    (nav as NavigatorWithUaData).userAgentData?.platform || nav.platform || nav.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

type KeyLike = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

/** キーの組み合わせに当たるか。修飾キーは過不足なく一致したときだけ当たる（Ctrl+Shift+Z を Ctrl+Z と取り違えない） */
export function matchesCombo(e: KeyLike, combo: KeyCombo, mac: boolean): boolean {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  const noMod = !e.metaKey && !e.ctrlKey;
  if (combo.mod === true ? !mod : !noMod) return false;
  if (!combo.anyShift && e.shiftKey !== (combo.shift === true)) return false;
  if (e.altKey !== (combo.alt === true)) return false;
  if (combo.code !== undefined) return e.code === combo.code;
  return combo.key !== undefined && e.key.toLowerCase() === combo.key.toLowerCase();
}

export function matchesShortcut(e: KeyLike, id: ShortcutId, mac: boolean): boolean {
  return SHORTCUTS[id].some((c) => matchesCombo(e, c, mac));
}

const KEY_NAMES_MAC: Record<string, string> = {
  Escape: "esc",
  Delete: "⌦",
  Backspace: "⌫",
  Enter: "↩",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};
const KEY_NAMES: Record<string, string> = {
  Escape: "Esc",
  Delete: "Delete",
  Backspace: "Backspace",
  Enter: "Enter",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};
const CODE_NAMES: Record<string, string> = { BracketRight: "]", BracketLeft: "[", Slash: "/" };

/** 表示用のキー。Mac は「⇧⌘Z」、ほかは「Ctrl+Shift+Z」 */
export function formatCombo(combo: KeyCombo, mac: boolean): string {
  const raw = combo.code !== undefined ? (CODE_NAMES[combo.code] ?? combo.code) : (combo.key ?? "");
  const key =
    (mac ? KEY_NAMES_MAC : KEY_NAMES)[raw] ?? (raw.length === 1 ? raw.toUpperCase() : raw);
  if (mac) {
    return `${combo.alt ? "⌥" : ""}${combo.shift ? "⇧" : ""}${combo.mod ? "⌘" : ""}${key}`;
  }
  return [combo.mod ? "Ctrl" : "", combo.alt ? "Alt" : "", combo.shift ? "Shift" : "", key]
    .filter((p) => p !== "")
    .join("+");
}

/** ショートカットの表示（先頭の組み合わせ） */
export function formatShortcut(id: ShortcutId, mac: boolean): string {
  const [first] = SHORTCUTS[id];
  return first === undefined ? "" : formatCombo(first, mac);
}
