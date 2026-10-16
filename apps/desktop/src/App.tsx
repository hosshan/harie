// デスクトップ版の画面。Web エディタと同じ編集画面（@harie/web の Workspace）を使い、
// ファイルは OS のダイアログで開き、Harie ファイルはそのまま上書き保存する（architecture 5）
import { loadDisplayFonts } from "@harie/web/fonts";
import { Header, HeaderButton } from "@harie/web/header";
import { loadFile, type Opened } from "@harie/web/load";
import type { Saved } from "@harie/web/save";
import { Workspace } from "@harie/web/workspace";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { chooseImage, chooseSavePath, readImage, writeImage } from "./native";
import { baseName, isImagePath, siblingPath } from "./paths";

export function App() {
  const [opened, setOpened] = useState<Opened | null>(null);
  // 開いている（保存した）ファイルのパス。貼り付けた画像には無い
  const path = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 開き直すたびにエディタ（と元に戻す履歴）を作り直す。保存で名前が変わっても作り直さない
  const [loadId, setLoadId] = useState(0);

  const show = useCallback((next: Opened, filePath: string | null) => {
    loadDisplayFonts();
    setError(null);
    path.current = filePath;
    setOpened(next);
    setLoadId((n) => n + 1);
  }, []);

  const openBytes = useCallback(
    (name: string, bytes: Uint8Array, filePath: string | null) => {
      const result = loadFile(name, bytes);
      if (result.ok) show(result.opened, filePath);
      else setError(result.message);
    },
    [show],
  );

  const openPath = useCallback(
    async (filePath: string) => {
      try {
        openBytes(baseName(filePath), await readImage(filePath), filePath);
      } catch (e) {
        setError(String(e));
      }
    },
    [openBytes],
  );

  const pick = async () => {
    const filePath = await chooseImage();
    if (filePath !== null) await openPath(filePath);
  };

  // ウィンドウの題名に開いているファイル名を出す
  useEffect(() => {
    void getCurrentWindow().setTitle(opened === null ? "Harie" : `${opened.fileName} — Harie`);
  }, [opened]);

  // ファイルのドラッグ＆ドロップは WebView ではなく Tauri が受け取る（パスが分かるので上書き保存できる）
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const dropped = event.payload.paths.find(isImagePath);
      if (dropped !== undefined) void openPath(dropped);
      else if (event.payload.paths.length > 0) setError("JPEG か PNG の画像を開いてください。");
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [openPath]);

  // 貼り付け（Ctrl / ⌘ + V）で画像を取り込む（FR-CAP-05）。保存するときに保存先を選ぶ
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file === undefined) return;
      e.preventDefault();
      void file
        .arrayBuffer()
        .then((buf) => openBytes(file.name || "clipboard.png", new Uint8Array(buf), null));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [openBytes]);

  const deliver = async (saved: Saved, current: Opened) => {
    // Harie ファイルを開いていたら上書き。普通の画像なら元の画像は残し、名前を変えて保存する。
    // 保存形式を変えたときも、拡張子が変わるので上書きせず別のファイルにする（Web と同じ決まり）
    let target = current.wasHarie && saved.format === current.format ? path.current : null;
    if (target === null) {
      const suggested =
        path.current === null ? saved.fileName : siblingPath(path.current, saved.fileName);
      target = await chooseSavePath(suggested, saved.format);
      if (target === null) throw new DOMException("保存をやめました", "AbortError");
    }
    await writeImage(target, saved.bytes);
    path.current = target;
  };

  return (
    <div className="app">
      {error !== null && (
        <p className="app-error" role="alert">
          {error}
        </p>
      )}
      {opened === null ? (
        <>
          <Header
            primary={
              <HeaderButton icon="open" variant="default" onClick={pick}>
                画像を開く
              </HeaderButton>
            }
          />
          <div className="app-drop">
            <p>
              スクリーンショットをドラッグ＆ドロップするか、貼り付け（Ctrl / ⌘ + V）してください。
            </p>
            <p className="harie-muted">
              JPEG と PNG に対応しています。保存した画像は普通の画像として使え、Harie
              で開けば注釈を直せます。
            </p>
          </div>
        </>
      ) : (
        <Workspace
          key={loadId}
          opened={opened}
          deliver={deliver}
          // 保存ダイアログで名前を変えたときは、実際に保存した名前を出す
          onChange={(next) =>
            setOpened(path.current === null ? next : { ...next, fileName: baseName(path.current) })
          }
          onReopen={(next) => show(next, path.current)}
          onOpenImage={pick}
        />
      )}
    </div>
  );
}
