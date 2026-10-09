// Web エディタ。画像を開く → 注釈を編集する（AI の提案・個人情報の検出を含む） → 保存する
import { useCallback, useEffect, useRef, useState } from "react";
import { loadDisplayFonts } from "./fonts";
import { Header, HeaderButton } from "./Header";
import { loadFile, type Opened } from "./load";
import { deliver, type Saved } from "./save";
import { Workspace } from "./Workspace";

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: object) => Promise<FileSystemFileHandle>;
};

const IMAGE_TYPES = [
  { description: "画像", accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] } },
];

export function App() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 開き直すたびにエディタ（と元に戻す履歴）を作り直す。保存で名前が変わっても作り直さない
  const [loadId, setLoadId] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const show = useCallback((next: Opened, fileHandle: FileSystemFileHandle | null) => {
    loadDisplayFonts();
    setError(null);
    setOpened(next);
    setHandle(fileHandle);
    setLoadId((n) => n + 1);
  }, []);

  const open = useCallback(
    async (file: File, fileHandle: FileSystemFileHandle | null) => {
      const result = loadFile(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      show(result.opened, fileHandle);
    },
    [show],
  );

  // ドラッグ＆ドロップと貼り付けで画像を取り込む（FR-CAP-05）
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file !== undefined) void open(file, null);
    };
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file === undefined) return;
      e.preventDefault();
      void open(new File([file], file.name || "clipboard.png", { type: file.type }), null);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [open]);

  const pick = async () => {
    const w = window as PickerWindow;
    if (w.showOpenFilePicker === undefined) {
      input.current?.click();
      return;
    }
    try {
      const [h] = await w.showOpenFilePicker({ types: IMAGE_TYPES });
      if (h !== undefined) await open(await h.getFile(), h);
    } catch {
      // 選択をやめた
    }
  };

  return (
    <div className="app">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        aria-label="画像ファイル"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file !== undefined) void open(file, null);
          e.target.value = "";
        }}
      />
      {error !== null && (
        <p className="app-error" role="alert">
          {error}
        </p>
      )}
      {opened === null ? (
        <>
          <Header>
            <HeaderButton icon="open" className="app-primary" onClick={pick}>
              画像を開く
            </HeaderButton>
          </Header>
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
          deliver={async (saved: Saved, current: Opened) => {
            // Harie ファイルを開いていたら上書き。普通の画像なら元の画像は残し、名前を変えて保存する
            let target = current.wasHarie ? handle : null;
            const w = window as PickerWindow;
            if (target === null && handle !== null && w.showSaveFilePicker !== undefined) {
              target = await w.showSaveFilePicker({
                suggestedName: saved.fileName,
                types: IMAGE_TYPES,
              });
            }
            await deliver(saved, target);
            setHandle(target);
          }}
          onChange={setOpened}
          onReopen={(next) => show(next, handle)}
          onOpenImage={pick}
        />
      )}
    </div>
  );
}
