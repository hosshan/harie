// OpenRouter の許可の画面から戻ってきたウィンドウ（ADR-0012）。code をキーに換えて登録し、閉じる。
// 元のウィンドウは storage イベントで接続を受け取る。ポップアップでなく同じウィンドウで来たときは、エディタに戻す
import { useEffect, useState } from "react";
import { useWebMessages } from "../messages";
import { completeOpenRouterAuth } from "./openrouter-auth";

// 開発中の StrictMode では effect が 2 回走る。code は 1 回しか使えないので、換える処理は 1 つにまとめる
let pending: Promise<boolean> | undefined;

export function OpenRouterCallback({ code }: { code: string }) {
  const m = useWebMessages();
  const [state, setState] = useState<"connecting" | "done" | "failed">("connecting");

  useEffect(() => {
    // code は 1 回しか使えない。URL に残さない
    window.history.replaceState(null, "", window.location.pathname);
    let cancelled = false;
    pending ??= completeOpenRouterAuth(code);
    pending.then((ok) => {
      if (cancelled) return;
      setState(ok ? "done" : "failed");
      if (!ok) return;
      if (window.opener === null) window.location.replace(window.location.pathname);
      else window.close();
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <main className="app-callback">
      <p role="status">
        {state === "connecting"
          ? m.openRouter.connecting
          : state === "done"
            ? m.openRouter.done
            : m.openRouter.failed}
      </p>
    </main>
  );
}
