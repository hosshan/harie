import "@harie/editor/editor.css";
import "./styles.css";
import { applyDocumentLang } from "@harie/editor/locale";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { OpenRouterCallback } from "./ai/OpenRouterCallback";
import { openRouterCallbackCode } from "./ai/openrouter-auth";

// 画面の言語（設定で選んだもの、なければブラウザの言語）を <html lang> に反映する
applyDocumentLang();
const root = document.getElementById("root");
if (root === null) throw new Error("#root がありません");
// OpenRouter の許可の画面から戻ってきたウィンドウなら、接続を終えるだけの画面にする（ADR-0012）
const openRouterCode = openRouterCallbackCode(window.location.href);
createRoot(root).render(
  <StrictMode>
    {openRouterCode === null ? <App /> : <OpenRouterCallback code={openRouterCode} />}
  </StrictMode>,
);
