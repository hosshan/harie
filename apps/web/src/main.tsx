import "@harie/editor/editor.css";
import "./styles.css";
import { applyDocumentLang } from "@harie/editor/locale";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// 画面の言語（設定で選んだもの、なければブラウザの言語）を <html lang> に反映する
applyDocumentLang();
const root = document.getElementById("root");
if (root === null) throw new Error("#root がありません");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
