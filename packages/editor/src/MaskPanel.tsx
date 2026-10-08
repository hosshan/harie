// 個人情報のマスクの設定と適用（FR-EDIT-05, FR-PII-02〜04）
import type { PiiMethod } from "@harie/model";
import { useState } from "react";
import { MASK_METHODS, type MaskDraft } from "./masks";

export type MaskPanelProps = {
  drafts: readonly MaskDraft[];
  onChange: (drafts: MaskDraft[]) => void;
  onApply: () => Promise<void>;
};

export function MaskPanel({ drafts, onChange, onApply }: MaskPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (id: string, patch: Partial<MaskDraft>) =>
    onChange(drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await onApply();
    } catch (e) {
      setError(`マスクを適用できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="harie-inspector-body harie-mask-panel" aria-label="個人情報のマスク">
      <h2>個人情報のマスク</h2>
      {drafts.length === 0 ? (
        <p className="harie-muted">隠したい範囲をドラッグして選んでください。</p>
      ) : (
        <ol className="harie-mask-list">
          {drafts.map((d, i) => (
            <li key={d.id}>
              <label>
                範囲 {i + 1} の隠し方
                <select
                  value={d.method}
                  onChange={(e) => update(d.id, { method: e.target.value as PiiMethod })}
                >
                  {MASK_METHODS.map((m) => (
                    <option key={m.method} value={m.method}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {d.method === "replace" && (
                <label>
                  置き換える文字
                  <input
                    value={d.replacement}
                    placeholder="例: 佐藤 花子"
                    onChange={(e) => update(d.id, { replacement: e.target.value })}
                  />
                </label>
              )}
              <button type="button" onClick={() => onChange(drafts.filter((x) => x.id !== d.id))}>
                範囲 {i + 1} を外す
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="harie-muted">
        適用すると画像そのものを書き換えます。元に戻すことはできず、保存したファイルにも元の内容は残りません。
      </p>
      <button
        type="button"
        className="harie-danger"
        disabled={drafts.length === 0 || busy}
        onClick={apply}
      >
        {busy ? "適用しています…" : "マスクを適用する"}
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}
