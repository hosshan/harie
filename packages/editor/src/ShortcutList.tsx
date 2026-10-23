// キーボードショートカットの一覧（FR-EDIT-12）。OS に合わせて ⌘ / Ctrl で示す。
// ダイアログの枠は呼び出し側（apps/web の Modal）が用意し、ここでは中身だけを描く
import { EDITOR_MESSAGES, type EditorMessages } from "./i18n/messages";
import { useMessages } from "./i18n/use-locale";
import {
  formatCombo,
  formatShortcut,
  isMacPlatform,
  SHORTCUTS,
  type ShortcutId,
} from "./shortcuts";
import { TOOL_SHORTCUTS } from "./tools";

export type ShortcutListProps = {
  /** 保存・画像を開くのショートカットがある画面か（拡張のエディタには「画像を開く」がない） */
  file?: { save?: boolean; open?: boolean };
  /** 個人情報を隠す道具があるか */
  mask?: boolean;
  /** 要素で囲む道具があるか（Chrome 拡張で撮った画像） */
  element?: boolean;
};

type Row = { label: string; keys: string[] };

export function ShortcutList({ file = {}, mask = true, element = false }: ShortcutListProps) {
  const m = useMessages(EDITOR_MESSAGES);
  const mac = isMacPlatform();
  const row = (id: ShortcutId, label: string = shortcutLabel(m, id)): Row => ({
    label,
    keys: [formatShortcut(id, mac)],
  });
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: m.shortcuts.groups.file,
      rows: [
        ...(file.save ? [row("save")] : []),
        ...(file.open ? [row("open")] : []),
        row("shortcuts"),
      ],
    },
    {
      title: m.shortcuts.groups.edit,
      rows: [
        row("undo"),
        { label: m.shortcuts.redo, keys: SHORTCUTS.redo.map((c) => formatCombo(c, mac)) },
        row("selectAll"),
        row("deselect"),
        row("copy"),
        row("cut"),
        row("paste"),
        row("duplicate"),
        { label: m.shortcuts.delete, keys: [mac ? "⌫" : "Delete"] },
      ],
    },
    {
      title: m.shortcuts.groups.selection,
      rows: [
        { label: m.shortcuts.nudge, keys: ["↑ ↓ ← →"] },
        { label: m.shortcuts.nudgeLarge, keys: [mac ? "⇧ + ↑ ↓ ← →" : "Shift + ↑ ↓ ← →"] },
        { label: m.shortcuts.resize, keys: [mac ? "⌘ + ↑ ↓ ← →" : "Ctrl + ↑ ↓ ← →"] },
        {
          label: m.shortcuts.resizeLarge,
          keys: [mac ? "⇧⌘ + ↑ ↓ ← →" : "Ctrl+Shift + ↑ ↓ ← →"],
        },
        row("editText"),
        row("bringForward"),
        row("sendBackward"),
        row("bringToFront"),
        row("sendToBack"),
      ],
    },
    {
      title: m.shortcuts.groups.tools,
      rows: TOOL_SHORTCUTS.filter(
        (t) => (mask || t.tool !== "mask") && (element || t.tool !== "element"),
      ).map((t) => ({
        label: m.tools[t.tool],
        keys: [t.key.toUpperCase()],
      })),
    },
    {
      title: m.shortcuts.groups.mouse,
      rows: [
        {
          label: m.shortcuts.shiftClick,
          keys: [m.shortcuts.shiftClickKeys(mac ? "⇧" : "Shift")],
        },
        { label: m.shortcuts.dragEmpty, keys: [m.shortcuts.dragEmptyKeys] },
        { label: m.shortcuts.doubleClick, keys: [m.shortcuts.doubleClickKeys] },
      ],
    },
  ];
  return (
    <div className="harie-shortcuts">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3>{g.title}</h3>
          <dl>
            {g.rows.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>
                  {r.keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && <span className="harie-muted"> {m.shortcuts.or} </span>}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function shortcutLabel(m: EditorMessages, id: ShortcutId): string {
  return id === "open" ? m.shortcuts.openImage : m.shortcuts[id as Exclude<ShortcutId, "open">];
}
