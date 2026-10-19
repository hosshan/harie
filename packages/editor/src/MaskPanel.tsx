// 個人情報のマスクの設定と適用（FR-EDIT-05, FR-PII-02〜04）
import type { PiiMethod } from "@harie/model";
import { useState } from "react";
import { EDITOR_MESSAGES } from "./i18n/messages";
import { useMessages } from "./i18n/use-locale";
import { MASK_METHODS, type MaskDraft } from "./masks";

export type MaskPanelProps = {
  drafts: readonly MaskDraft[];
  onChange: (drafts: MaskDraft[]) => void;
  /** 適用せずにやめる（範囲はすべて捨てる） */
  onCancel: () => void;
  onApply: () => Promise<void>;
};

export function MaskPanel({ drafts, onChange, onCancel, onApply }: MaskPanelProps) {
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
              <label>
                {m.mask.method(i + 1, d.kind === undefined ? undefined : m.mask.kinds[d.kind])}
                <select
                  value={d.method}
                  onChange={(e) => update(d.id, { method: e.target.value as PiiMethod })}
                >
                  {MASK_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {m.mask.methods[method]}
                    </option>
                  ))}
                </select>
              </label>
              {d.method === "replace" && (
                <label>
                  {m.mask.replacement}
                  <input
                    value={d.replacement}
                    placeholder={m.mask.replacementPlaceholder}
                    onChange={(e) => update(d.id, { replacement: e.target.value })}
                  />
                </label>
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
    </section>
  );
}
