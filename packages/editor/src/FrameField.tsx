// 画像の仕上げ（FR-FILE-16）。何も選んでいないときの右の欄に置き、保存する画像に付ける枠線・影・角丸を
// それぞれ付け外しする（組み合わせられる）
import type { Frame, HarieDocument } from "@harie/model";
import type { Dispatch } from "react";
import {
  FRAME_BORDER_COLORS,
  FRAME_BORDER_WIDTHS,
  FRAME_PARTS,
  FRAME_RADII,
  type FramePart,
  frameParts,
  toggleFramePart,
} from "./frame-parts";
import type { EditorAction } from "./history";
import { EDITOR_MESSAGES } from "./i18n/messages";
import { useMessages } from "./i18n/use-locale";
import { SizeField } from "./SizeField";

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
  const frame = doc.frame;
  const update = (patch: Partial<Frame>) =>
    dispatch({ type: "apply", ops: [{ op: "frame", frame: { ...frame, ...patch } }] });
  const border = frame?.border;
  const borderColor = (border?.color ?? FRAME_BORDER_COLORS[0].value).toUpperCase();
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
      {parts.radius && (
        <SizeField
          legend={m.frame.radius}
          options={FRAME_RADII.map((o) => ({
            label: m.frame.radii[o.name],
            value: Math.round(o.value * scale),
          }))}
          min={1}
          max={1000}
          value={frame?.radius}
          onChange={(v) => update({ radius: v })}
          sample={(_, i) => (
            <span
              className="harie-sample-radius"
              style={{ borderTopLeftRadius: [3, 6, 9, 14][i] ?? 6 }}
            />
          )}
        />
      )}
      {parts.border && border !== undefined && (
        <>
          <SizeField
            legend={m.frame.borderWidth}
            options={FRAME_BORDER_WIDTHS.map((o) => ({
              label: m.strokeWidths[o.name],
              value: Math.max(1, Math.round(o.value * scale)),
            }))}
            min={1}
            max={100}
            value={border.width}
            onChange={(v) => update({ border: { ...border, width: v } })}
            sample={(_, i) => (
              <span className="harie-sample-line" style={{ height: [1, 2, 3.5, 6][i] ?? 2 }} />
            )}
          />
          <fieldset className="harie-field">
            <legend className="harie-field-label">{m.frame.borderColor}</legend>
            <div className="harie-swatches">
              {FRAME_BORDER_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="harie-swatch"
                  aria-label={m.frame.borderColors[c.name]}
                  title={m.frame.borderColors[c.name]}
                  aria-pressed={borderColor === c.value}
                  style={{ background: c.value }}
                  onClick={() => update({ border: { ...border, color: c.value } })}
                />
              ))}
            </div>
          </fieldset>
        </>
      )}
    </section>
  );
}
