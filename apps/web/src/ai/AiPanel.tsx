// AI の補足提案（FR-AI-01, 02）と個人情報の検出（FR-PII-01）。
// 画像を外部に送るのはボタンを押したときだけで、送る前に送信先を表示し、同意を求める（NFR-SEC-01）
import type { DomSnapshot, PiiCandidate, Suggestion } from "@harie/ai";
import {
  adoptSuggestionOps,
  type EditorAction,
  pendingSuggestionIds,
  rejectSuggestionOps,
} from "@harie/editor";
import type { HarieDocument } from "@harie/model";
import { type Dispatch, useState } from "react";
import { useApiKey } from "./api-key";

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

function message(e: unknown): string {
  // AiError の文言は API キーを含まない（packages/ai）。それ以外は中身を出さない
  return e instanceof Error && e.name === "AiError" ? e.message : "AI の呼び出しに失敗しました";
}

export function AiPanel({ doc, dispatch, base, onPiiFound, dom }: AiPanelProps) {
  const apiKey = useApiKey();
  const [consent, setConsent] = useState(false);
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState<"suggest" | "pii" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const pending = suggestions.filter((s) => pendingSuggestionIds(doc, ids(s)).length > 0);
  const allIds = pending.flatMap(ids);

  // API キーはヘッダーの「設定」で登録する。未登録のときは AI の欄を出さない
  if (apiKey === null) return null;

  const run = async (kind: "suggest" | "pii") => {
    setBusy(kind);
    setError(null);
    setStatus(kind === "suggest" ? "AI が画像を見ています…" : "個人情報を探しています…");
    try {
      const { runDetectPii, runSuggest } = await import("./run");
      if (kind === "suggest") {
        const found = await runSuggest(apiKey, base, doc, intent, dom);
        // 提案はまとめて 1 回の操作として追加する（元に戻すで一度に消せる）
        dispatch({
          type: "apply",
          ops: found.flatMap((s) => s.annotations.map((annotation) => ({ op: "add", annotation }))),
        });
        setSuggestions((prev) => [...prev, ...found]);
        setStatus(
          found.length === 0
            ? "提案はありませんでした"
            : `${found.length} 件の提案を追加しました。採用したものだけが保存されます`,
        );
      } else {
        const found = await runDetectPii(apiKey, base, doc, dom);
        onPiiFound(found);
        setStatus(
          found.length === 0
            ? "個人情報らしきものは見つかりませんでした。念のため目でも確認してください"
            : `${found.length} か所の候補をマスクの範囲にしました。確認してから適用してください`,
        );
      }
    } catch (e) {
      setStatus(null);
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="harie-inspector-body app-ai" aria-label="AI">
      <h2>AI</h2>
      <label>
        説明したいこと
        <textarea
          rows={2}
          value={intent}
          placeholder="例: 通知の設定方法"
          onChange={(e) => setIntent(e.target.value)}
        />
      </label>
      <p className="app-ai-notice">
        {`ボタンを押すと、この画像${dom === undefined ? "" : "と、キャプチャしたページの文字・要素の位置"}を Anthropic の Claude API に送信します。個人情報が写っている場合は、先に隠してから使ってください。`}
      </p>
      <label className="app-ai-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        この画像を送信してよい
      </label>
      <div className="app-ai-actions">
        <button type="button" disabled={!consent || busy !== null} onClick={() => run("suggest")}>
          AI に提案してもらう
        </button>
        <button type="button" disabled={!consent || busy !== null} onClick={() => run("pii")}>
          個人情報を探す
        </button>
      </div>
      {status !== null && (
        <p className="harie-muted" role="status">
          {status}
        </p>
      )}
      {error !== null && <p role="alert">{error}</p>}
      {pending.length > 0 && (
        <div className="app-ai-suggestions">
          <h3>提案（{pending.length} 件）</h3>
          <ol>
            {pending.map((s) => (
              <li key={ids(s).join(" ")}>
                <span>{s.text}</span>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "apply", ops: adoptSuggestionOps(doc, ids(s)) })}
                >
                  採用
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "apply", ops: rejectSuggestionOps(doc, ids(s)) })}
                >
                  却下
                </button>
              </li>
            ))}
          </ol>
          <p className="app-ai-actions">
            <button
              type="button"
              onClick={() => dispatch({ type: "apply", ops: adoptSuggestionOps(doc, allIds) })}
            >
              すべて採用
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "apply", ops: rejectSuggestionOps(doc, allIds) })}
            >
              すべて却下
            </button>
          </p>
        </div>
      )}
    </section>
  );
}
