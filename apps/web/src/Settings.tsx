// 設定（ヘッダー右端）。今は AI に関する設定（API キー）だけを持つ
import { useEffect, useRef, useState } from "react";
import { storeApiKey, useApiKey } from "./ai/api-key";

let openListener: (() => void) | null = null;

/** ヘッダーの設定を開く（AI のパネルの「設定を開く」から使う） */
export function openSettings(): void {
  openListener?.();
}

export function SettingsButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    openListener = () => setOpen(true);
    return () => {
      openListener = null;
    };
  }, []);
  useEffect(() => {
    const d = dialog.current;
    if (d === null) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        設定
      </button>
      <dialog
        ref={dialog}
        className="app-settings"
        aria-label="設定"
        onClose={() => setOpen(false)}
      >
        {open && <AiSettings />}
        <p className="app-settings-actions">
          <button type="button" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </p>
      </dialog>
    </>
  );
}

function AiSettings() {
  const apiKey = useApiKey();
  const [draft, setDraft] = useState("");
  return (
    <section className="app-settings-section" aria-label="AI に関する設定">
      <h2>AI に関する設定</h2>
      <p className="harie-muted">
        説明の提案と個人情報の検出には、Anthropic の API
        キーが必要です。キーはこのブラウザにだけ保存し、ファイルには含めません。
      </p>
      {apiKey === null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const key = draft.trim();
            if (key === "") return;
            storeApiKey(key);
            setDraft("");
          }}
        >
          <label>
            API キー
            <input
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button type="submit" disabled={draft.trim() === ""}>
            キーを登録
          </button>
        </form>
      ) : (
        <p className="app-settings-row">
          <span>API キーは登録済みです。</span>
          <button type="button" onClick={() => storeApiKey(null)}>
            API キーを削除
          </button>
        </p>
      )}
    </section>
  );
}
