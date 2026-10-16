// 設定（ヘッダー右端、狭い画面では三点メニュー）。今は AI に関する設定（API キー）だけを持つ
import { type ReactNode, useState } from "react";
import { storeApiKey, useApiKey } from "./ai/api-key";
import { Modal } from "./Modal";

/** 設定のダイアログ。開くボタンはヘッダーが画面の幅に合わせて出す（ボタンか、三点メニューの項目） */
export function useSettingsDialog(): { open: () => void; dialog: ReactNode } {
  const [open, setOpen] = useState(false);
  return {
    open: () => setOpen(true),
    dialog: (
      <Modal open={open} label="設定" onClose={() => setOpen(false)} className="app-settings">
        <AiSettings />
        <p className="app-modal-actions">
          <button type="button" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </p>
      </Modal>
    ),
  };
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
