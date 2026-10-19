// Web エディタ。画像を開く → 注釈を編集する（AI の提案・個人情報の検出を含む） → 保存する
import { useCallback, useEffect, useRef, useState } from "react";
import { loadDisplayFonts } from "./fonts";
import { useGuide } from "./Guide";
import { Header, HeaderButton } from "./Header";
import { loadFile, type Opened } from "./load";
import { useWebMessages, webMessages } from "./messages";
import { deliver, type Saved } from "./save";
import { Workspace } from "./Workspace";

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: object) => Promise<FileSystemFileHandle>;
};

/**
 * 保存ダイアログの種類は、保存する形式の 1 つだけにする。
 * 両方を渡すと、ダイアログの既定の形式が先頭（JPEG）になり、PNG を保存するときに拡張子がずれることがある
 */
function saveTypes(format: "jpeg" | "png") {
  const m = webMessages().open;
  return format === "png"
    ? [{ description: m.pngFiles, accept: { "image/png": [".png"] } }]
    : [{ description: m.jpegFiles, accept: { "image/jpeg": [".jpg", ".jpeg"] } }];
}

function imageTypes() {
  return [
    {
      description: webMessages().open.imageFiles,
      accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] },
    },
  ];
}

export function App() {
  const m = useWebMessages();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 開き直すたびにエディタ（と元に戻す履歴）を作り直す。保存で名前が変わっても作り直さない
  const [loadId, setLoadId] = useState(0);
  const guide = useGuide();
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
      const [h] = await w.showOpenFilePicker({ types: imageTypes() });
      if (h !== undefined) await open(await h.getFile(), h);
    } catch {
      // 選択をやめた
    }
  };

  return (
    <div className="app">
      {guide.dialog}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        aria-label={m.open.fileInput}
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
          <Header
            primary={
              <HeaderButton icon="open" variant="default" onClick={pick}>
                {m.open.button}
              </HeaderButton>
            }
            actions={[guide.action]}
          />
          <div className="app-drop">
            <p>{m.open.dropHint}</p>
            <p className="harie-muted">{m.open.formats}</p>
            <p className="harie-muted">{m.open.integrations}</p>
          </div>
        </>
      ) : (
        <Workspace
          key={loadId}
          opened={opened}
          deliver={async (saved: Saved, current: Opened) => {
            // Harie ファイルを開いていたら上書き。普通の画像なら元の画像は残し、名前を変えて保存する。
            // 保存形式を変えたときも、拡張子が変わるので上書きせず別のファイルにする
            let target = current.wasHarie && saved.format === current.format ? handle : null;
            const w = window as PickerWindow;
            if (target === null && handle !== null && w.showSaveFilePicker !== undefined) {
              target = await w.showSaveFilePicker({
                suggestedName: saved.fileName,
                types: saveTypes(saved.format),
              });
            }
            await deliver(saved, target);
            setHandle(target);
          }}
          onChange={setOpened}
          onReopen={(next) => show(next, handle)}
          onOpenImage={pick}
          actions={[guide.action]}
        />
      )}
    </div>
  );
}
