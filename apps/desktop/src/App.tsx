// デスクトップ版の画面。Web エディタと同じ編集画面（@harie/web の Workspace）を使い、
// ファイルは OS のダイアログで開き、Harie ファイルはそのまま上書き保存する（architecture 5）
import { loadDisplayFonts } from "@harie/web/fonts";
import { Header, HeaderButton } from "@harie/web/header";
import { loadFile, type Opened } from "@harie/web/load";
import { useWebMessages, webMessages } from "@harie/web/messages";
import type { Saved } from "@harie/web/save";
import { Workspace } from "@harie/web/workspace";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chooseImage,
  chooseSavePath,
  confirmDiscard,
  OPEN_FILES_EVENT,
  readImage,
  takePendingFiles,
  writeImage,
} from "./native";
import { baseName, isImagePath, siblingPath } from "./paths";

export function App() {
  const m = useWebMessages();
  const [opened, setOpened] = useState<Opened | null>(null);
  // 開いている（保存した）ファイルのパス。貼り付けた画像には無い
  const path = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 開き直すたびにエディタ（と元に戻す履歴）を作り直す。保存で名前が変わっても作り直さない
  const [loadId, setLoadId] = useState(0);
  // 保存していない変更があるか（Workspace から受け取る）。閉じる・別のファイルを開く前の確認に使う
  const dirty = useRef(false);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

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
      // D&D・関連付けから開くときは、ヘッダーの「画像を開く」と違って画面の確認を通らないので、ここで確かめる
      if (dirty.current && !(await confirmDiscard("open"))) return;
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
    if (filePath === null) return;
    // 「画像を開く」は Workspace が確認してから呼ぶので、ここでは確かめ直さない
    dirty.current = false;
    await openPath(filePath);
  };

  // 関連付け・「このアプリで開く」から渡されたファイルを開く。1 つのウィンドウで扱うので、最後の 1 つだけを開く
  useEffect(() => {
    const openPending = async () => {
      const last = (await takePendingFiles()).at(-1);
      if (last !== undefined) await openPath(last);
    };
    const unlisten = listen(OPEN_FILES_EVENT, () => void openPending());
    // 画面ができる前に渡されたもの（起動したときのファイル）も、知らせを待てるようになってから受け取る
    void unlisten.then(openPending);
    return () => {
      void unlisten.then((f) => f());
    };
  }, [openPath]);

  // 保存していない変更があれば、ウィンドウを閉じる前に確かめる（WebView の beforeunload は Tauri では確認を出さない）
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (dirty.current && !(await confirmDiscard("close"))) event.preventDefault();
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

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
      else if (event.payload.paths.length > 0) setError(webMessages().load.unsupported);
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
      if (target === null) throw new DOMException(webMessages().save.cancelled, "AbortError");
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
                {m.open.button}
              </HeaderButton>
            }
          />
          <div className="app-drop">
            <p>{m.open.dropHint}</p>
            <p className="harie-muted">{m.open.formats}</p>
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
          onDirtyChange={onDirtyChange}
        />
      )}
    </div>
  );
}
