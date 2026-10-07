import "@anoi/editor/editor.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (root === null) throw new Error("#root がありません");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
