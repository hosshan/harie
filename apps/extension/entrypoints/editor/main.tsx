// 拡張の中のエディタページ。キャプチャか、空のエディタで取り込んだ画像を開き、Web と同じ編集画面（@harie/web の Workspace）で編集する
import "@harie/editor/editor.css";
import "@harie/web/styles.css";
import type { DomSnapshot } from "@harie/ai";
import { applyDocumentLang } from "@harie/editor/locale";
import { loadDisplayFonts } from "@harie/web/fonts";
import { Header, HeaderButton } from "@harie/web/header";
import { loadFile, type Opened } from "@harie/web/load";
import { useWebMessages, webMessages } from "@harie/web/messages";
import type { Saved } from "@harie/web/save";
import { openButtonTitle, StartHint, useImageIntake, useOpenShortcut } from "@harie/web/start";
import { Workspace } from "@harie/web/workspace";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { getCapture } from "@/lib/capture-store";

/** 保存は chrome.downloads で行う（拡張ページではファイルの上書きができないため、毎回新しいファイルにする） */
async function deliver(saved: Saved): Promise<void> {
  const blob = new Blob([saved.bytes as Uint8Array<ArrayBuffer>], {
    type: saved.format === "png" ? "image/png" : "image/jpeg",
  });
  const url = URL.createObjectURL(blob);
  try {
    await browser.downloads.download({ url, filename: saved.fileName, conflictAction: "uniquify" });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** キャプチャから開いたときは DOM 情報が付く。空のエディタで取り込んだ画像には付かない */
type Loaded = { opened: Opened; dom: DomSnapshot | null };

function App() {
  const m = useWebMessages();
  // URL の # にキャプチャの id がなければ、空のエディタとして開く（FR-CAP-08）
  const [captureId] = useState(() => decodeURIComponent(location.hash.slice(1)));
  const [loading, setLoading] = useState(captureId !== "");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadId, setLoadId] = useState(0);

  const show = useCallback((fileName: string, bytes: Uint8Array, dom: DomSnapshot | null) => {
    const result = loadFile(fileName, bytes);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    loadDisplayFonts();
    setError(null);
    setLoaded({ opened: result.opened, dom });
    setLoadId((n) => n + 1);
  }, []);

  useEffect(() => {
    if (captureId === "") return;
    void (async () => {
      const record = await getCapture(captureId);
      if (record === undefined) setError(webMessages().extension.notFound);
      else show(record.fileName, new Uint8Array(await record.image.arrayBuffer()), record.dom);
      setLoading(false);
    })();
  }, [captureId, show]);

  // Web と同じく、ファイルを選ぶ・ドラッグ＆ドロップ・貼り付けで画像を取り込む（FR-CAP-05）
  const { pick, input } = useImageIntake(
    (file) => void file.arrayBuffer().then((b) => show(file.name, new Uint8Array(b), null)),
  );
  // 画像を開く前も Ctrl / ⌘ + O で開ける。開いた後は Workspace が受け持つ
  useOpenShortcut(pick, loaded === null && !loading);

  return (
    <div className="app">
      {input}
      {error !== null && (
        <p className="app-error" role="alert">
          {error}
        </p>
      )}
      {loaded === null ? (
        <>
          {/* 開いた後は Workspace がファイル名と保存の入ったヘッダーを出す */}
          <Header
            primary={
              <HeaderButton
                icon="open"
                variant="default"
                onClick={pick}
                title={openButtonTitle(m.open.button)}
              >
                {m.open.button}
              </HeaderButton>
            }
          />
          {loading ? (
            <p className="harie-muted">{m.open.loading}</p>
          ) : (
            <StartHint integrations={false} />
          )}
        </>
      ) : (
        <Workspace
          key={loadId}
          opened={loaded.opened}
          deliver={deliver}
          onChange={(opened) => setLoaded({ ...loaded, opened })}
          onReopen={(opened) => {
            setLoaded({ ...loaded, opened });
            setLoadId((n) => n + 1);
          }}
          onOpenImage={pick}
          {...(loaded.dom === null ? {} : { dom: loaded.dom })}
        />
      )}
    </div>
  );
}

applyDocumentLang();
const root = document.getElementById("root");
if (root === null) throw new Error("#root がありません");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
