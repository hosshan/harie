// 大きさ（線の太さ・文字サイズ・角の丸みなど）を候補のタイルと数値の入力で選ぶ欄。右の欄で共通に使う
import { type ReactNode, useEffect, useState } from "react";
import { EDITOR_MESSAGES } from "./i18n/messages";
import { useMessages } from "./i18n/use-locale";

/**
 * 文字サイズ・線の太さ。仕上がりの見本のタイルから選ぶ。細かい値は「数値で指定」を開いて入れる
 * （入力欄を離れる・Enter で 1 回の操作として確定する）。候補にない値のときは最初から開いておく。
 * 複数選んでいて値が揃っていない（value が undefined）ときは「混在」と示し、選んだ値を全部に入れる
 */
export function SizeField({
  legend,
  options,
  min,
  max,
  value,
  onChange,
  sample,
}: {
  legend: string;
  options: readonly { label: string; value: number }[];
  min: number;
  max: number;
  value: number | undefined;
  onChange: (v: number) => void;
  sample: (option: { label: string; value: number }, index: number) => ReactNode;
}) {
  const m = useMessages(EDITOR_MESSAGES);
  const shown = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const [custom, setCustom] = useState(
    () => value !== undefined && !options.some((o) => o.value === value),
  );
  const commit = () => {
    const v = Number.parseFloat(draft);
    if (Number.isFinite(v) && v > 0) onChange(v);
    else setDraft(shown);
  };
  return (
    <fieldset className="harie-field">
      <legend className="harie-field-label">
        {legend}
        <span className="harie-field-value">
          {value === undefined ? m.inspector.mixed : `${value}px`}
        </span>
      </legend>
      <div className="harie-tiles">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            className="harie-tile"
            aria-label={o.label}
            aria-pressed={value === o.value}
            title={m.inspector.tileTitle(o.label, o.value)}
            onClick={() => onChange(o.value)}
          >
            {sample(o, i)}
            <small aria-hidden="true">{o.value}</small>
          </button>
        ))}
      </div>
      {custom ? (
        <span className="harie-number-field">
          <button
            type="button"
            aria-label={m.inspector.decrease(legend)}
            disabled={value === undefined || value <= min}
            onClick={() => value !== undefined && onChange(value - 1)}
          >
            −
          </button>
          <input
            type="number"
            aria-label={m.inspector.valuePx(legend)}
            min={min}
            max={max}
            step={1}
            value={draft}
            placeholder={value === undefined ? m.inspector.mixed : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
          />
          <span aria-hidden="true">px</span>
          <button
            type="button"
            aria-label={m.inspector.increase(legend)}
            disabled={value === undefined || value >= max}
            onClick={() => value !== undefined && onChange(value + 1)}
          >
            +
          </button>
        </span>
      ) : (
        <button type="button" className="harie-link-button" onClick={() => setCustom(true)}>
          {m.inspector.custom}
        </button>
      )}
    </fieldset>
  );
}
