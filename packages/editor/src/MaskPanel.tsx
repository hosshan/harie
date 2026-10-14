// 個人情報のマスクの設定と適用（FR-EDIT-05, FR-PII-02〜04）
import type { PiiMethod } from "@harie/model";
import { useState } from "react";
import { MASK_METHODS, type MaskDraft, PII_KIND_LABELS } from "./masks";

export type MaskPanelProps = {
  drafts: readonly MaskDraft[];
  onChange: (drafts: MaskDraft[]) => void;
  /** 適用せずにやめる（範囲はすべて捨てる） */
  onCancel: () => void;
  onApply: () => Promise<void>;
};

export function MaskPanel({ drafts, onChange, onCancel, onApply }: MaskPanelProps) {
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
                {`範囲 ${i + 1}${d.kind === undefined ? " " : `（${PII_KIND_LABELS[d.kind]}）`}の隠し方`}
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
                範囲 {i + 1} を削除
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="harie-muted">
        適用すると画像そのものを書き換えます。保存するまでは、範囲を選んで隠すのをやめられます。保存すると元に戻せず、ファイルにも元の内容は残りません。
      </p>
      {confirming ? (
        <div role="alertdialog" aria-label="マスクの適用の確認" className="harie-mask-confirm">
          <p>
            <strong>{drafts.length} か所を画像に焼き込みます。保存すると元に戻せません。</strong>
          </p>
          <p className="harie-mask-actions">
            <button type="button" onClick={() => setConfirming(false)}>
              戻る
            </button>
            <button type="button" className="harie-danger" onClick={apply}>
              適用する
            </button>
          </p>
        </div>
      ) : (
        <p className="harie-mask-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className="harie-danger"
            disabled={drafts.length === 0 || busy}
            onClick={() => setConfirming(true)}
          >
            {busy ? "適用しています…" : "マスクを適用する"}
          </button>
        </p>
      )}
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}
