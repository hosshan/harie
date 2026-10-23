// AI の補足提案（FR-AI-01, 02）と個人情報の検出（FR-PII-01）。
// 画像を外部に送るのはボタンを押したときだけで、送る前に送信先を表示し、同意を求める（NFR-SEC-01）。
// API キーがなくても、キャプチャした DOM があれば、そのテキストから個人情報を手元で探せる（FR-PII-06）
import type { DomSnapshot, PiiCandidate, Suggestion } from "@harie/ai";
import {
  adoptSuggestionOps,
  type EditorAction,
  pendingSuggestionIds,
  rejectSuggestionOps,
  useLocale,
} from "@harie/editor";
import type { HarieDocument } from "@harie/model";
import { type Dispatch, useState } from "react";
import { useWebMessages, type WebMessages } from "../messages";
import { useSettingsDialog } from "../Settings";
import { type AiProvider, useAiCredential } from "./api-key";
import { canConnectOpenRouter } from "./openrouter-auth";

type Base = { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" };

export type AiPanelProps = {
  doc: HarieDocument;
  dispatch: Dispatch<EditorAction>;
  base: Base;
  /** 検出した個人情報の候補。マスクの下書きにする（加工は利用者が確認してから） */
  onPiiFound: (candidates: PiiCandidate[]) => void;
  /** キャプチャ時の DOM 情報。あれば枠を要素に合わせ（FR-AI-03）、DOM のテキストからも個人情報を探す */
  dom?: DomSnapshot;
};

const ids = (s: Suggestion) => s.annotations.map((a) => a.id);

type AiErrorKind = keyof WebMessages["ai"]["errors"];

function message(m: WebMessages, e: unknown): string {
  // AiError は失敗の種類（kind）を持つので、表示言語の文言にする。それ以外は中身を出さない（API キーを含みうる）
  const kind =
    e instanceof Error && e.name === "AiError" ? (e as Error & { kind?: string }).kind : undefined;
  return kind !== undefined && kind in m.ai.errors
    ? m.ai.errors[kind as AiErrorKind]
    : m.ai.errors.other;
}

export function AiPanel({ doc, dispatch, base, onPiiFound, dom }: AiPanelProps) {
  const m = useWebMessages();
  const locale = useLocale();
  const credential = useAiCredential();
  const settings = useSettingsDialog();
  const [consent, setConsent] = useState(false);
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState<"suggest" | "pii" | "local-pii" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const pending = suggestions.filter((s) => pendingSuggestionIds(doc, ids(s)).length > 0);
  const allIds = pending.flatMap(ids);

  const run = async (kind: "suggest" | "pii") => {
    if (credential === null) return;
    setBusy(kind);
    setError(null);
    setStatus(kind === "suggest" ? m.ai.suggesting : m.ai.detecting);
    try {
      const { runDetectPii, runSuggest } = await import("./run");
      if (kind === "suggest") {
        const found = await runSuggest(credential, base, doc, intent, locale, dom);
        // 提案はまとめて 1 回の操作として追加する（元に戻すで一度に消せる）
        dispatch({
          type: "apply",
          ops: found.flatMap((s) => s.annotations.map((annotation) => ({ op: "add", annotation }))),
        });
        setSuggestions((prev) => [...prev, ...found]);
        setStatus(found.length === 0 ? m.ai.noSuggestions : m.ai.suggested(found.length));
      } else {
        const found = await runDetectPii(credential, base, doc, dom);
        onPiiFound(found);
        setStatus(found.length === 0 ? m.ai.noPii : m.ai.piiFound(found.length));
      }
    } catch (e) {
      setStatus(null);
      setError(message(m, e));
    } finally {
      setBusy(null);
    }
  };

  // DOM のテキストだけで探す。画像は送らないので、同意は求めない
  const runLocal = async (snapshot: DomSnapshot) => {
    setBusy("local-pii");
    setError(null);
    try {
      const { detectPiiFromDom } = await import("@harie/ai");
      const found = detectPiiFromDom(snapshot);
      onPiiFound(found);
      setStatus(found.length === 0 ? m.ai.noPiiLocal : m.ai.piiFound(found.length));
    } catch (e) {
      setStatus(null);
      setError(message(m, e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="harie-inspector-body app-ai" aria-label="AI">
      <h2>{m.ai.title}</h2>
      {dom !== undefined && (
        <div className="app-ai-local">
          <p className="harie-muted">{m.ai.localNote}</p>
          <button type="button" disabled={busy !== null} onClick={() => runLocal(dom)}>
            {m.ai.detectPiiLocal}
          </button>
        </div>
      )}
      {credential === null ? (
        // API キーはヘッダーの「設定」で登録する。ここからも同じ設定を開ける
        <p className="app-ai-setup">
          {/* Chrome 拡張とデスクトップでは OpenRouter に接続できないので、キーの登録だけを案内する */}
          <span className="harie-muted">
            {canConnectOpenRouter() ? m.ai.needKey : m.ai.needKeyOnly}
          </span>
          <button type="button" onClick={settings.open}>
            {m.ai.openSettings}
          </button>
        </p>
      ) : (
        <AiRequestForm
          intent={intent}
          onIntentChange={setIntent}
          withDom={dom !== undefined}
          provider={credential.provider}
          consent={consent}
          onConsentChange={setConsent}
          busy={busy !== null}
          onRun={run}
        />
      )}
      {status !== null && (
        <p className="harie-muted" role="status">
          {status}
        </p>
      )}
      {error !== null && <p role="alert">{error}</p>}
      {pending.length > 0 && (
        <div className="app-ai-suggestions">
          <h3>{m.ai.suggestions(pending.length)}</h3>
          <ol>
            {pending.map((s) => (
              <li key={ids(s).join(" ")}>
                <span>{s.text}</span>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "apply", ops: adoptSuggestionOps(doc, ids(s)) })}
                >
                  {m.ai.adopt}
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "apply", ops: rejectSuggestionOps(doc, ids(s)) })}
                >
                  {m.ai.reject}
                </button>
              </li>
            ))}
          </ol>
          <p className="app-ai-actions">
            <button
              type="button"
              onClick={() => dispatch({ type: "apply", ops: adoptSuggestionOps(doc, allIds) })}
            >
              {m.ai.adoptAll}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "apply", ops: rejectSuggestionOps(doc, allIds) })}
            >
              {m.ai.rejectAll}
            </button>
          </p>
        </div>
      )}
      {settings.dialog}
    </section>
  );
}

type AiRequestFormProps = {
  intent: string;
  onIntentChange: (intent: string) => void;
  withDom: boolean;
  provider: AiProvider;
  consent: boolean;
  onConsentChange: (consent: boolean) => void;
  busy: boolean;
  onRun: (kind: "suggest" | "pii") => void;
};

/** Claude API に送る操作。送信先の表示と同意がないとボタンを押せない（NFR-SEC-01） */
function AiRequestForm({
  intent,
  onIntentChange,
  withDom,
  provider,
  consent,
  onConsentChange,
  busy,
  onRun,
}: AiRequestFormProps) {
  const m = useWebMessages();
  return (
    <>
      <label>
        {m.ai.intent}
        <textarea
          rows={2}
          value={intent}
          placeholder={m.ai.intentPlaceholder}
          onChange={(e) => onIntentChange(e.target.value)}
        />
      </label>
      <p className="app-ai-notice">{m.ai.notice(withDom, provider)}</p>
      <label className="app-ai-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => onConsentChange(e.target.checked)}
        />
        {m.ai.consent}
      </label>
      <div className="app-ai-actions">
        <button type="button" disabled={!consent || busy} onClick={() => onRun("suggest")}>
          {m.ai.suggest}
        </button>
        <button type="button" disabled={!consent || busy} onClick={() => onRun("pii")}>
          {m.ai.detectPii}
        </button>
      </div>
    </>
  );
}
