// 画像の仕上げ（FR-FILE-16）。何も選んでいないときの右の欄に置き、保存する画像に付ける枠線・影・角丸を
// それぞれ付け外しする（組み合わせられる）
import type { HarieDocument } from "@harie/model";
import type { Dispatch } from "react";
import { FRAME_PARTS, type FramePart, frameParts, toggleFramePart } from "./frame-parts";
import type { EditorAction } from "./history";
import { EDITOR_MESSAGES } from "./i18n/messages";
import { useMessages } from "./i18n/use-locale";

/** 部品の見本（小さな画像に、その部品だけを付けた形） */
function FrameSample({ part }: { part: FramePart }) {
  const rx = part === "radius" ? 4 : 0;
  return (
    <svg viewBox="0 0 34 24" width="34" height="24" aria-hidden="true">
      {part === "shadow" && (
        <rect
          x="6"
          y="6.5"
          width="22"
          height="13"
          fill="#2B2620"
          opacity="0.35"
          style={{ filter: "blur(1.6px)" }}
        />
      )}
      <rect
        x="6"
        y="5"
        width="22"
        height="13"
        rx={rx}
        fill="#E9E4DC"
        stroke={part === "border" ? "#6B655E" : "none"}
        strokeWidth="1.4"
      />
      <rect x="9" y="8" width="9" height="2" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

export function FrameField({
  doc,
  dispatch,
  scale,
}: {
  doc: HarieDocument;
  dispatch: Dispatch<EditorAction>;
  /** 画像の解像度（FR-EDIT-16）。線・余白・影・角丸の大きさをこれに合わせる */
  scale: number;
}) {
  const m = useMessages(EDITOR_MESSAGES);
  const parts = frameParts(doc.frame);
  const toggle = (part: FramePart) =>
    dispatch({
      type: "apply",
      ops: [{ op: "frame", frame: toggleFramePart(doc.frame, part, scale) ?? null }],
    });
  return (
    <section className="harie-inspector-body harie-frame-field" aria-label={m.frame.label}>
      <fieldset className="harie-field">
        <legend className="harie-field-label">{m.frame.label}</legend>
        <div className="harie-tiles harie-frame-tiles">
          {FRAME_PARTS.map((p) => (
            <button
              key={p}
              type="button"
              className="harie-tile"
              aria-pressed={parts[p]}
              onClick={() => toggle(p)}
            >
              <FrameSample part={p} />
              <small>{m.frame.parts[p]}</small>
            </button>
          ))}
        </div>
        <p className="harie-frame-note">{m.frame.note}</p>
      </fieldset>
    </section>
  );
}
