// 設定（ヘッダー右端、狭い画面では三点メニュー）。表示言語と、AI に関する設定（OpenRouter の接続か API キー）を持つ
import { type Locale, setLocale, useLocale } from "@harie/editor";
import { type ReactNode, useState } from "react";
import { storeCredential, useAiCredential } from "./ai/api-key";
import { canConnectOpenRouter, connectOpenRouter } from "./ai/openrouter-auth";
import { Modal } from "./Modal";
import { useWebMessages } from "./messages";

/** API キーを作る画面（Anthropic Console） */
const KEYS_URL = "https://platform.claude.com/settings/keys";

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
  const credential = useAiCredential();
  return (
    <section className="app-settings-section" aria-label={m.settings.ai}>
      <h2>{m.settings.ai}</h2>
      {credential === null ? (
        <>
          <p className="harie-muted">
            {canConnectOpenRouter() ? m.settings.aiNote : m.settings.aiNoteKeyOnly}
          </p>
          {canConnectOpenRouter() && <OpenRouterConnect />}
          <AnthropicKeyForm />
        </>
      ) : (
        <p className="app-settings-row">
          <span>
            {credential.provider === "openrouter"
              ? m.settings.openRouterConnected
              : m.settings.registered}
          </span>
          <button type="button" onClick={() => storeCredential(null)}>
            {credential.provider === "openrouter"
              ? m.settings.openRouterDisconnect
              : m.settings.remove}
          </button>
        </p>
      )}
    </section>
  );
}

/** OpenRouter の OAuth で接続する（ADR-0012）。許可は別のウィンドウで行い、終わるとこの画面が接続済みに変わる */
function OpenRouterConnect() {
  const m = useWebMessages();
  const [state, setState] = useState<"idle" | "waiting" | "blocked">("idle");
  return (
    <div className="app-settings-option">
      <h3>{m.settings.openRouterTitle}</h3>
      <p className="harie-muted">{m.settings.openRouterNote}</p>
      <button
        type="button"
        onClick={async () => setState((await connectOpenRouter()) ? "waiting" : "blocked")}
      >
        {m.settings.openRouterConnect}
      </button>
      {state !== "idle" && (
        <p className="harie-muted" role="status">
          {state === "waiting" ? m.settings.openRouterWaiting : m.settings.openRouterBlocked}
        </p>
      )}
    </div>
  );
}

function AnthropicKeyForm() {
  const m = useWebMessages();
  const [draft, setDraft] = useState("");
  return (
    <div className="app-settings-option">
      <h3>{m.settings.anthropicTitle}</h3>
      <ol className="app-settings-steps">
        {m.settings.keySteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="app-settings-link">
        <a href={KEYS_URL} target="_blank" rel="noreferrer">
          {m.settings.keyLink}
        </a>
      </p>
      <p className="harie-muted">{m.settings.keyBilling}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const key = draft.trim();
          if (key === "") return;
          storeCredential({ provider: "anthropic", key });
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
    </div>
  );
}
