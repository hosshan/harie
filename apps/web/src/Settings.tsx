// 設定（ヘッダー右端、狭い画面では三点メニュー）。表示言語と、AI に関する設定（API キー）を持つ
import { type Locale, setLocale, useLocale } from "@harie/editor";
import { type ReactNode, useState } from "react";
import { storeApiKey, useApiKey } from "./ai/api-key";
import { Modal } from "./Modal";
import { useWebMessages } from "./messages";

/** 言語の名前は、その言語自身で書く（今の表示言語が読めない人でも選べるように） */
const LANGUAGES: readonly { locale: Locale; name: string }[] = [
  { locale: "ja", name: "日本語" },
  { locale: "en", name: "English" },
];

/** 設定のダイアログ。開くボタンはヘッダーが画面の幅に合わせて出す（ボタンか、三点メニューの項目） */
export function useSettingsDialog(): { open: () => void; dialog: ReactNode } {
  const m = useWebMessages();
  const [open, setOpen] = useState(false);
  return {
    open: () => setOpen(true),
    dialog: (
      <Modal
        open={open}
        label={m.settings.title}
        onClose={() => setOpen(false)}
        className="app-settings"
      >
        <LanguageSettings />
        <AiSettings />
        <p className="app-modal-actions">
          <button type="button" onClick={() => setOpen(false)}>
            {m.settings.close}
          </button>
        </p>
      </Modal>
    ),
  };
}

function LanguageSettings() {
  const m = useWebMessages();
  const locale = useLocale();
  return (
    <section className="app-settings-section" aria-label={m.settings.language}>
      <h2>{m.settings.language}</h2>
      <p className="harie-muted">{m.settings.languageNote}</p>
      <div className="app-settings-languages">
        {LANGUAGES.map((l) => (
          <button
            key={l.locale}
            type="button"
            lang={l.locale}
            aria-pressed={locale === l.locale}
            onClick={() => setLocale(l.locale)}
          >
            {l.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function AiSettings() {
  const m = useWebMessages();
  const apiKey = useApiKey();
  const [draft, setDraft] = useState("");
  return (
    <section className="app-settings-section" aria-label={m.settings.ai}>
      <h2>{m.settings.ai}</h2>
      <p className="harie-muted">{m.settings.aiNote}</p>
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
            {m.settings.apiKey}
            <input
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button type="submit" disabled={draft.trim() === ""}>
            {m.settings.register}
          </button>
        </form>
      ) : (
        <p className="app-settings-row">
          <span>{m.settings.registered}</span>
          <button type="button" onClick={() => storeApiKey(null)}>
            {m.settings.remove}
          </button>
        </p>
      )}
    </section>
  );
}
