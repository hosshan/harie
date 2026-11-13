// 画像の仕上げ（FR-FILE-16）。何も選んでいないときの右の欄に置き、保存する画像のまわりの余白・影・枠線を選ぶ
import type { HarieDocument } from "@harie/model";
import type { Dispatch } from "react";
import { FRAME_PRESETS, type FramePreset, framePreset, matchFramePreset } from "./frame-presets";
import type { EditorAction } from "./history";
import { EDITOR_MESSAGES } from "./i18n/messages";
import { useMessages } from "./i18n/use-locale";

/** 選択肢の見本（小さな画像に、その仕上げを付けた形） */
function FrameSample({ preset }: { preset: FramePreset }) {
  const shadow = preset === "shadow" || preset === "card";
  return (
    <svg viewBox="0 0 34 24" width="34" height="24" aria-hidden="true">
      {shadow && (
        <rect
          x="7"
          y="7.5"
          width="20"
          height="12"
          rx={preset === "card" ? 2.5 : 0}
          fill="#2B2620"
          opacity="0.28"
          style={{ filter: "blur(1.6px)" }}
        />
      )}
      <rect
        x={shadow ? 7 : 3}
        y={shadow ? 6 : 3}
        width={shadow ? 20 : 28}
        height={shadow ? 12 : 18}
        rx={preset === "card" ? 2.5 : 0}
        fill="#FFFFFF"
        stroke={preset === "none" ? "#E4E4E7" : preset === "border" ? "#8A8580" : "none"}
        strokeWidth={preset === "border" ? 1.4 : 1}
      />
      <rect
        x={shadow ? 10 : 7}
        y={shadow ? 9 : 7}
        width={shadow ? 8 : 12}
        height="2"
        rx="1"
        fill="currentColor"
        opacity="0.35"
      />
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
  /** 画像の解像度（FR-EDIT-16）。余白・影の大きさをこれに合わせる */
  scale: number;
}) {
  const m = useMessages(EDITOR_MESSAGES);
  const current = matchFramePreset(doc.frame, scale);
  const apply = (preset: FramePreset) =>
    dispatch({ type: "apply", ops: [{ op: "frame", frame: framePreset(preset, scale) ?? null }] });
  return (
    <section className="harie-inspector-body harie-frame-field" aria-label={m.frame.label}>
      <fieldset className="harie-field">
        <legend className="harie-field-label">{m.frame.label}</legend>
        <div className="harie-tiles">
          {FRAME_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="harie-tile"
              aria-pressed={current === p}
              onClick={() => apply(p)}
            >
              <FrameSample preset={p} />
              <small>{m.frame.presets[p]}</small>
            </button>
          ))}
        </div>
        <p className="harie-frame-note">{m.frame.note}</p>
      </fieldset>
    </section>
  );
}
