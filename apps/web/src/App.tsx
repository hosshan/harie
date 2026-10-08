// Web エディタ。画像を開く → 注釈を編集する（AI の提案・個人情報の検出を含む） → 保存する
import { addDetectedMasks, Editor, type MaskDraft, useEditorState } from "@harie/editor";
import { type PiiMask, recordPiiApplied } from "@harie/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiPanel } from "./ai/AiPanel";
import { boldFontUrl, browserRenderer, regularFontUrl } from "./browser-renderer";
import { loadFile, mismatchMessage, type Opened } from "./load";
import { buildSaveFile, deliver } from "./save";

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: object) => Promise<FileSystemFileHandle>;
};

const IMAGE_TYPES = [
  { description: "画像", accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] } },
];

let fontsLoaded = false;
/** 編集画面の文字を保存時と同じフォント（Noto Sans JP）で表示する（ADR-0005） */
function loadDisplayFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  for (const [url, weight] of [
    [regularFontUrl, "400"],
    [boldFontUrl, "700"],
  ] as const) {
    const face = new FontFace("Noto Sans JP", `url(${url})`, { weight });
    document.fonts.add(face);
    face.load().catch(() => {});
  }
}

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
      <header className="app-header">
        <h1>Harie</h1>
        <button type="button" onClick={pick}>
          {opened === null ? "画像を開く" : "別の画像を開く"}
        </button>
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
      </header>
      {error !== null && (
        <p className="app-error" role="alert">
          {error}
        </p>
      )}
      {opened === null ? (
        <div className="app-drop">
          <p>
            スクリーンショットをドラッグ＆ドロップするか、貼り付け（Ctrl / ⌘ + V）してください。
          </p>
          <p className="harie-muted">
            JPEG と PNG に対応しています。保存した画像は普通の画像として使え、Harie
            で開けば注釈を直せます。
          </p>
        </div>
      ) : (
        <Workspace
          key={loadId}
          opened={opened}
          handle={handle}
          onChange={(next, nextHandle) => {
            setOpened(next);
            setHandle(nextHandle);
          }}
          onReopen={(next) => show(next, handle)}
        />
      )}
    </div>
  );
}

function Workspace({
  opened,
  handle,
  onChange,
  onReopen,
}: {
  opened: Opened;
  handle: FileSystemFileHandle | null;
  /** 保存・マスクの適用で、開いているファイルの状態が変わった */
  onChange: (opened: Opened, handle: FileSystemFileHandle | null) => void;
  /** 別の状態で開き直す（エディタと元に戻す履歴を作り直す） */
  onReopen: (opened: Opened) => void;
}) {
  const [state, dispatch] = useEditorState(opened.doc);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showWarning, setShowWarning] = useState(opened.warning !== undefined);
  const [masks, setMasks] = useState<MaskDraft[]>([]);
  const savedDoc = useRef(opened.doc);
  const dirty =
    state.doc.annotations !== savedDoc.current.annotations ||
    state.doc.pii !== savedDoc.current.pii;

  const baseImageUrl = useMemo(
    () =>
      URL.createObjectURL(
        new Blob([opened.base.bytes as Uint8Array<ArrayBuffer>], { type: opened.base.mediaType }),
      ),
    [opened.base],
  );
  useEffect(() => () => URL.revokeObjectURL(baseImageUrl), [baseImageUrl]);

  // 保存していない変更があるときはページを閉じる前に確認する
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    setStatus("保存しています…");
    try {
      const saved = await buildSaveFile(opened, state.doc);
      // Harie ファイルを開いていたら上書き。普通の画像なら元の画像は残し、名前を変えて保存する
      let target = opened.wasHarie ? handle : null;
      const w = window as PickerWindow;
      if (target === null && handle !== null && w.showSaveFilePicker !== undefined) {
        target = await w.showSaveFilePicker({ suggestedName: saved.fileName, types: IMAGE_TYPES });
      }
      await deliver(saved, target);
      dispatch({ type: "saved", revision: saved.doc.revision, meta: saved.doc.meta });
      savedDoc.current = { ...state.doc, revision: saved.doc.revision };
      setStatus(`${saved.fileName} を保存しました`);
      onChange({ ...opened, fileName: saved.fileName, wasHarie: true, doc: saved.doc }, target);
    } catch (e) {
      setStatus(
        e instanceof DOMException && e.name === "AbortError" ? null : `保存できませんでした: ${e}`,
      );
    } finally {
      setSaving(false);
    }
  };

  // 個人情報のマスクはベース画像そのものを書き換える（ADR-0007）。加工前の画像はどこにも残さない
  const applyMasks = async (masks: PiiMask[]) => {
    const { width, height } = state.doc.canvas;
    const result = await (await browserRenderer()).applyMasks({
      base: opened.base,
      width,
      height,
      masks,
    });
    dispatch({ type: "piiApplied", pii: recordPiiApplied(state.doc, result.applied).pii });
    // 外部で編集された画像の「今の画像で開き直す」も、加工前の画像を持つので捨てる
    const { alternative: _, ...rest } = opened;
    onChange({ ...rest, base: result.base }, handle);
    setStatus(`${result.applied.length} か所をマスクしました。保存するとファイルに反映されます`);
  };

  return (
    <main className="app-main">
      <div className="app-file">
        <span className="app-file-name">{opened.fileName}</span>
        <button type="button" className="app-primary" disabled={saving} onClick={save}>
          保存
        </button>
        {status !== null && (
          <span className="harie-muted" role="status">
            {status}
          </span>
        )}
      </div>
      {showWarning && opened.warning !== undefined && (
        <div className="app-warning" role="alert">
          <p>{mismatchMessage(opened.warning)}</p>
          {opened.alternative !== undefined && (
            <p className="app-warning-actions">
              <button type="button" onClick={() => setShowWarning(false)}>
                保存されていた注釈で編集する
              </button>
              <button
                type="button"
                onClick={() => opened.alternative !== undefined && onReopen(opened.alternative)}
              >
                今の画像を新しい下地にする（注釈は消えます）
              </button>
            </p>
          )}
        </div>
      )}
      <Editor
        state={state}
        dispatch={dispatch}
        baseImageUrl={baseImageUrl}
        onApplyMasks={applyMasks}
        masks={masks}
        onMasksChange={setMasks}
        aside={
          <AiPanel
            doc={state.doc}
            dispatch={dispatch}
            base={opened.base}
            onPiiFound={(found) => setMasks((current) => addDetectedMasks(current, found))}
          />
        }
      />
    </main>
  );
}
