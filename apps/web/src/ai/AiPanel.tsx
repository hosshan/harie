// AI の補足提案（FR-AI-01, 02）と個人情報の検出（FR-PII-01）。提案は右の欄の末尾、個人情報はマスクの欄の末尾に出す。
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

type Base = { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" };

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

/** 失敗の表示と、実行中の操作。提案と個人情報の欄で同じ形で持つ */
function useRun<K extends string>() {
  const m = useWebMessages();
  const [busy, setBusy] = useState<K | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (kind: K, pendingStatus: string | null, task: () => Promise<string>) => {
    setBusy(kind);
    setError(null);
    setStatus(pendingStatus);
    try {
      setStatus(await task());
    } catch (e) {
      setStatus(null);
      setError(message(m, e));
    } finally {
      setBusy(null);
    }
  };
  const feedback = (
    <>
      {status !== null && (
        <p className="harie-muted" role="status">
          {status}
        </p>
      )}
      {error !== null && <p role="alert">{error}</p>}
    </>
  );
  return { busy, run, feedback };
}

export type AiSuggestPanelProps = {
  doc: HarieDocument;
  dispatch: Dispatch<EditorAction>;
  base: Base;
  /** キャプチャ時の DOM 情報。あれば枠を要素に合わせる（FR-AI-03） */
  dom?: DomSnapshot;
};

/** AI の補足提案（FR-AI-01, 02）。右の欄の末尾に、注釈を選んでいないときだけ出す */
export function AiSuggestPanel({ doc, dispatch, base, dom }: AiSuggestPanelProps) {
  const m = useWebMessages();
  const locale = useLocale();
  const credential = useAiCredential();
  const settings = useSettingsDialog();
  const [consent, setConsent] = useState(false);
  const [intent, setIntent] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const { busy, run, feedback } = useRun<"suggest">();

  const pending = suggestions.filter((s) => pendingSuggestionIds(doc, ids(s)).length > 0);
  const allIds = pending.flatMap(ids);

  const suggest = () => {
    if (credential === null) return;
    void run("suggest", m.ai.suggesting, async () => {
      const { runSuggest } = await import("./run");
      const found = await runSuggest(credential, base, doc, intent, locale, dom);
      // 提案はまとめて 1 回の操作として追加する（元に戻すで一度に消せる）
      dispatch({
        type: "apply",
        ops: found.flatMap((s) => s.annotations.map((annotation) => ({ op: "add", annotation }))),
      });
      setSuggestions((prev) => [...prev, ...found]);
      return found.length === 0 ? m.ai.noSuggestions : m.ai.suggested(found.length);
    });
  };

  return (
    <section className="harie-inspector-body app-ai" aria-label={m.ai.title}>
      <h2>{m.ai.title}</h2>
      {credential === null ? (
        // API キーはヘッダーの「設定」で登録する。ここからも同じ設定を開ける
        <p className="app-ai-setup">
          <span className="harie-muted">{m.ai.needKey}</span>
          <button type="button" onClick={settings.open}>
            {m.ai.openSettings}
          </button>
        </p>
      ) : (
        <>
          {/* 見出しで用途がわかるので、ラベルは出さずプレースホルダで示す（読み上げ用の名前は付ける） */}
          <textarea
            rows={2}
            aria-label={m.ai.intent}
            value={intent}
            placeholder={m.ai.intentPlaceholder}
            onChange={(e) => setIntent(e.target.value)}
          />
          <AiConsent
            withDom={dom !== undefined}
            provider={credential.provider}
            consent={consent}
            onConsentChange={setConsent}
          />
          <div className="app-ai-actions">
            <button type="button" disabled={!consent || busy !== null} onClick={suggest}>
              {m.ai.suggest}
            </button>
          </div>
        </>
      )}
      {feedback}
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

export type AiPiiPanelProps = {
  doc: HarieDocument;
  base: Base;
  /** 検出した個人情報の候補。マスクの下書きにする（加工は利用者が確認してから） */
  onPiiFound: (candidates: PiiCandidate[]) => void;
  /** キャプチャ時の DOM 情報。あれば DOM のテキストからも個人情報を探す（FR-PII-06） */
  dom?: DomSnapshot;
};

/**
 * 個人情報を探す（FR-PII-01, 06）。個人情報のマスクの欄の末尾に、範囲を選んでいる間だけ出す。
 * DOM があればキーなしで手元で探し、AI に接続していれば画像からも探す
 */
export function AiPiiPanel({ doc, base, onPiiFound, dom }: AiPiiPanelProps) {
  const m = useWebMessages();
  const credential = useAiCredential();
  const [consent, setConsent] = useState(false);
  const { busy, run, feedback } = useRun<"pii" | "local-pii">();
  if (dom === undefined && credential === null) return null;

  // DOM のテキストだけで探す。画像は送らないので、同意は求めない
  const runLocal = (snapshot: DomSnapshot) =>
    run("local-pii", null, async () => {
      const { detectPiiFromDom } = await import("@harie/ai");
      const found = detectPiiFromDom(snapshot);
      onPiiFound(found);
      return found.length === 0 ? m.ai.noPiiLocal : m.ai.piiFound(found.length);
    });

  const runAi = () => {
    if (credential === null) return;
    void run("pii", m.ai.detecting, async () => {
      const { runDetectPii } = await import("./run");
      const found = await runDetectPii(credential, base, doc, dom);
      onPiiFound(found);
      return found.length === 0 ? m.ai.noPii : m.ai.piiFound(found.length);
    });
  };

  return (
    <section className="app-ai" aria-label={m.ai.piiTitle}>
      <h3>{m.ai.piiTitle}</h3>
      {dom !== undefined && (
        <div className="app-ai-local">
          <p className="harie-muted">{m.ai.localNote}</p>
          <button type="button" disabled={busy !== null} onClick={() => void runLocal(dom)}>
            {m.ai.detectPiiLocal}
          </button>
        </div>
      )}
      {credential !== null && (
        <>
          <AiConsent
            withDom={dom !== undefined}
            provider={credential.provider}
            consent={consent}
            onConsentChange={setConsent}
          />
          <div className="app-ai-actions">
            <button type="button" disabled={!consent || busy !== null} onClick={runAi}>
              {m.ai.detectPii}
            </button>
          </div>
        </>
      )}
      {feedback}
    </section>
  );
}

type AiConsentProps = {
  withDom: boolean;
  provider: AiProvider;
  consent: boolean;
  onConsentChange: (consent: boolean) => void;
};

/** 送信先の表示と同意。同意がないと送るボタンを押せない（NFR-SEC-01） */
function AiConsent({ withDom, provider, consent, onConsentChange }: AiConsentProps) {
  const m = useWebMessages();
  return (
    <>
      <p className="app-ai-notice">{m.ai.notice(withDom, provider)}</p>
      <label className="app-ai-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => onConsentChange(e.target.checked)}
        />
        {m.ai.consent}
      </label>
    </>
  );
}
