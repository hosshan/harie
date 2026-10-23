// 個人情報のマスクの設定と適用（FR-EDIT-05, FR-PII-02〜04）
import type { PiiMethod } from "@harie/model";
import { type ReactNode, useEffect, useState } from "react";
import { EDITOR_MESSAGES } from "./i18n/messages";
import { useMessages } from "./i18n/use-locale";
import { MASK_METHODS, type MaskDraft } from "./masks";

export type MaskPanelProps = {
  drafts: readonly MaskDraft[];
  onChange: (drafts: MaskDraft[]) => void;
  /** 適用せずにやめる（範囲はすべて捨てる） */
  onCancel: () => void;
  onApply: () => Promise<void>;
  /** 欄の末尾に出す内容（個人情報を探す操作など）。範囲の設定と適用の邪魔をしないよう後ろに置く */
  children?: ReactNode;
};

/** 隠し方の見本（仕上がりの見た目を小さく示す。右の欄のほかのタイルと同じ「見て選ぶ」形） */
const METHOD_SAMPLES: Record<PiiMethod, ReactNode> = {
  fill: <rect x="3" y="4" width="22" height="10" rx="1.5" fill="currentColor" />,
  replace: (
    <>
      <rect x="3" y="4" width="22" height="10" rx="1.5" fill="none" stroke="currentColor" />
      <path d="M7 9h4M13 9h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  mosaic: (
    <g fill="currentColor">
      <rect x="3" y="4" width="5" height="5" opacity="0.9" />
      <rect x="8" y="4" width="5" height="5" opacity="0.45" />
      <rect x="13" y="4" width="6" height="5" opacity="0.75" />
      <rect x="19" y="4" width="6" height="5" opacity="0.35" />
      <rect x="3" y="9" width="5" height="5" opacity="0.4" />
      <rect x="8" y="9" width="5" height="5" opacity="0.8" />
      <rect x="13" y="9" width="6" height="5" opacity="0.5" />
      <rect x="19" y="9" width="6" height="5" opacity="0.85" />
    </g>
  ),
  // フィルタは ID が範囲ごとに重なるので使わず、輪郭をぼかした重ねで見せる
  blur: (
    <g fill="currentColor">
      <rect x="2" y="3" width="24" height="12" rx="6" opacity="0.15" />
      <rect x="4" y="5" width="20" height="8" rx="4" opacity="0.25" />
      <rect x="6" y="6.5" width="16" height="5" rx="2.5" opacity="0.35" />
    </g>
  ),
};

/** 置き換える文字。打つたびではなく、入力欄を離れたときに 1 回の操作として確定する（元に戻す単位） */
function ReplacementField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const m = useMessages(EDITOR_MESSAGES);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <label>
      {m.mask.replacement}
      <input
        value={text}
        placeholder={m.mask.replacementPlaceholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </label>
  );
}

export function MaskPanel({ drafts, onChange, onCancel, onApply, children }: MaskPanelProps) {
  const m = useMessages(EDITOR_MESSAGES);
  const [busy, setBusy] = useState(false);
  // 適用は画像そのものを書き換える（保存すると戻せない）ので、押し間違いに備えてもう一度確かめる
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (id: string, patch: Partial<MaskDraft>) =>
    onChange(drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const apply = async () => {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      await onApply();
    } catch (e) {
      setError(m.mask.error(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="harie-inspector-body harie-mask-panel" aria-label={m.mask.label}>
      <h2>{m.mask.label}</h2>
      {drafts.length === 0 ? (
        <p className="harie-muted">{m.mask.hint}</p>
      ) : (
        <ol className="harie-mask-list">
          {drafts.map((d, i) => (
            <li key={d.id}>
              <fieldset className="harie-field harie-mask-method">
                <legend className="harie-field-label">
                  {m.mask.method(i + 1, d.kind === undefined ? undefined : m.mask.kinds[d.kind])}
                </legend>
                <div className="harie-tiles">
                  {MASK_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      className="harie-tile"
                      aria-label={m.mask.methods[method]}
                      aria-pressed={d.method === method}
                      title={m.mask.methods[method]}
                      onClick={() => d.method !== method && update(d.id, { method })}
                    >
                      <svg viewBox="0 0 28 18" width="28" height="18" aria-hidden="true">
                        {METHOD_SAMPLES[method]}
                      </svg>
                      <small aria-hidden="true">{m.mask.methodsShort[method]}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              {d.method === "replace" && (
                <ReplacementField
                  value={d.replacement}
                  onCommit={(replacement) => update(d.id, { replacement })}
                />
              )}
              <button type="button" onClick={() => onChange(drafts.filter((x) => x.id !== d.id))}>
                {m.mask.remove(i + 1)}
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="harie-muted">{m.mask.note}</p>
      {confirming ? (
        <div role="alertdialog" aria-label={m.mask.confirmLabel} className="harie-mask-confirm">
          <p>
            <strong>{m.mask.confirm(drafts.length)}</strong>
          </p>
          <p className="harie-mask-actions">
            <button type="button" onClick={() => setConfirming(false)}>
              {m.mask.back}
            </button>
            <button type="button" className="harie-danger" onClick={apply}>
              {m.mask.applyConfirm}
            </button>
          </p>
        </div>
      ) : (
        <p className="harie-mask-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            {m.mask.cancel}
          </button>
          <button
            type="button"
            className="harie-danger"
            disabled={drafts.length === 0 || busy}
            onClick={() => setConfirming(true)}
          >
            {busy ? m.mask.applying : m.mask.apply}
          </button>
        </p>
      )}
      {error !== null && <p role="alert">{error}</p>}
      {children !== undefined && <div className="harie-mask-extra">{children}</div>}
    </section>
  );
}
