// 拡張の中のエディタページ。キャプチャを開き、Web と同じ編集画面（@harie/web の Workspace）で編集する
import "@harie/editor/editor.css";
import "@harie/web/styles.css";
import { loadDisplayFonts } from "@harie/web/fonts";
import { Header } from "@harie/web/header";
import { loadFile, type Opened } from "@harie/web/load";
import type { Saved } from "@harie/web/save";
import { Workspace } from "@harie/web/workspace";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { type CaptureRecord, getCapture } from "@/lib/capture-store";

/** 保存は chrome.downloads で行う（拡張ページではファイルの上書きができないため、毎回新しいファイルにする） */
async function deliver(saved: Saved): Promise<void> {
  const blob = new Blob([saved.bytes as Uint8Array<ArrayBuffer>], {
    type: saved.fileName.endsWith(".png") ? "image/png" : "image/jpeg",
  });
  const url = URL.createObjectURL(blob);
  try {
    await browser.downloads.download({ url, filename: saved.fileName, conflictAction: "uniquify" });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

type Loaded = { record: CaptureRecord; opened: Opened } | { error: string };

function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [loadId, setLoadId] = useState(0);

  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    void (async () => {
      const record = id === "" ? undefined : await getCapture(id);
      if (record === undefined) {
        setLoaded({ error: "キャプチャが見つかりません。もう一度キャプチャしてください。" });
        return;
      }
      const result = loadFile(record.fileName, new Uint8Array(await record.image.arrayBuffer()));
      if (!result.ok) {
        setLoaded({ error: result.message });
        return;
      }
      loadDisplayFonts();
      setLoaded({ record, opened: result.opened });
      setOpened(result.opened);
    })();
  }, []);

  return (
    <div className="app">
      {/* 開いた後は Workspace がファイル名と保存の入ったヘッダーを出す */}
      {opened === null && <Header />}
      {loaded === null && <p className="harie-muted">読み込んでいます…</p>}
      {loaded !== null && "error" in loaded && (
        <p className="app-error" role="alert">
          {loaded.error}
        </p>
      )}
      {loaded !== null && "record" in loaded && opened !== null && (
        <Workspace
          key={loadId}
          opened={opened}
          deliver={deliver}
          onChange={setOpened}
          onReopen={(next) => {
            setOpened(next);
            setLoadId((n) => n + 1);
          }}
          {...(loaded.record.dom === null ? {} : { dom: loaded.record.dom })}
        />
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("#root がありません");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
