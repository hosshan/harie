// 開いた画像の編集画面。保存・個人情報のマスク・AI の提案と検出をまとめる（Web と Chrome 拡張で共通）
import type { DomSnapshot } from "@harie/ai";
import {
  addDetectedMasks,
  EDITOR_MESSAGES,
  Editor,
  isMacPlatform,
  matchesShortcut,
  type PickableElement,
  ShortcutList,
  useEditorState,
  useMessages,
  useObjectUrl,
} from "@harie/editor";
import { type ImageFormat, readBaseImage } from "@harie/format";
import { type PiiMask, recordPiiApplied } from "@harie/model";
import { rebaseDocument } from "@harie/render";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiPiiPanel, useAiSuggest } from "./ai/AiPanel";
import { browserRenderer } from "./browser-renderer";
import { Header, type HeaderAction, HeaderButton } from "./Header";
import { mismatchMessage, type Opened } from "./load";
import { Modal } from "./Modal";
import { useWebMessages } from "./messages";
import { SaveFormatMenu, SaveFormatMenuItems } from "./SaveFormatMenu";
import { buildSaveFile, type Saved } from "./save";
import { addUnsaved, masksInImage, removeUnsaved, type UnsavedMasks } from "./unsaved-masks";

/** 吹き出しに入れる要素の名前の長さの上限。長い本文などはそのまま入れず、短くして示す */
const MAX_ELEMENT_LABEL = 40;

/** キャプチャ時の DOM を、要素で囲む道具（FR-EDIT-15）で選べる要素にする */
export function pickableElements(dom: DomSnapshot): PickableElement[] {
  return dom.elements.map((e) => {
    const label = (e.name ?? e.text ?? "").replace(/\s+/g, " ").trim();
    return {
      rect: e.rect,
      role: e.role,
      label: label.length > MAX_ELEMENT_LABEL ? `${label.slice(0, MAX_ELEMENT_LABEL)}…` : label,
    };
  });
}

export type WorkspaceProps = {
  opened: Opened;
  /**
   * 保存したファイルを書き出す（Web は File System Access API かダウンロード、拡張は chrome.downloads）。
   * 利用者が取りやめたら AbortError の DOMException を投げる
   */
  deliver: (saved: Saved, opened: Opened) => Promise<void>;
  /** 保存・マスクの適用で、開いているファイルの状態が変わった */
  onChange: (opened: Opened) => void;
  /** 別の状態で開き直す（エディタと元に戻す履歴を作り直す） */
  onReopen: (opened: Opened) => void;
  /** キャプチャ時の DOM 情報（拡張から開いたとき）。AI の提案・個人情報の検出に使い、保存しない */
  dom?: DomSnapshot;
  /** 別の画像を選んで開く（Web）。渡すとヘッダーに「画像を開く」を出し、押すと確認してから呼ぶ */
  onOpenImage?: () => void;
  /** ヘッダーで「保存」の右に足す操作（Web の「連携」など）。狭い画面では三点メニューに入る */
  actions?: readonly HeaderAction[];
  /** 保存していない変更の有無が変わった（デスクトップでウィンドウを閉じる前の確認に使う） */
  onDirtyChange?: (dirty: boolean) => void;
};

/** 開いた 1 枚の画像の編集画面（保存・マスク・AI を含む）。Web と Chrome 拡張で共通 */
export function Workspace({
  opened,
  deliver,
  onChange,
  onReopen,
  dom,
  onOpenImage,
  actions = [],
  onDirtyChange,
}: WorkspaceProps) {
  const m = useWebMessages();
  const em = useMessages(EDITOR_MESSAGES);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [state, dispatch] = useEditorState(opened.doc);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [format, setFormat] = useState<ImageFormat>(opened.format);
  const [showWarning, setShowWarning] = useState(opened.warning !== undefined);
  // 保存するまでは、適用したマスクを外せるように加工前の画像を持つ（ADR-0009）
  const [unsaved, setUnsaved] = useState<UnsavedMasks | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 画像を差し替えたら、キャプチャ時の DOM 情報は今の画像と合わないので使わない
  const [rebased, setRebased] = useState(false);
  const elements = useMemo(
    () => (dom === undefined || rebased ? [] : pickableElements(dom)),
    [dom, rebased],
  );
  const replaceInput = useRef<HTMLInputElement>(null);
  // 個人情報の検出は時間がかかる。待つ間に描いた範囲を消さないよう、終わった時点の下書きに足す
  const masksRef = useRef(state.masks);
  masksRef.current = state.masks;
  const savedDoc = useRef(opened.doc);
  const dirty =
    state.doc.annotations !== savedDoc.current.annotations ||
    state.doc.pii !== savedDoc.current.pii ||
    state.doc.canvas !== savedDoc.current.canvas;

  const baseImageUrl = useObjectUrl(opened.base.bytes, opened.base.mediaType);
  const aiSuggest = useAiSuggest({
    doc: state.doc,
    dispatch,
    base: opened.base,
    ...(dom === undefined || rebased ? {} : { dom }),
    onStatus: setStatus,
  });

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // 保存していない変更があるときはページを閉じる前に確認する
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    setStatus(m.save.saving);
    try {
      const saved = await buildSaveFile(opened, state.doc, format);
      await deliver(saved, opened);
      dispatch({ type: "saved", revision: saved.doc.revision, meta: saved.doc.meta });
      savedDoc.current = { ...state.doc, revision: saved.doc.revision };
      setStatus(m.save.saved(saved.fileName));
      // 保存したら、加工前の画像はメモリからも捨てる。以後は適用したマスクを外せない
      setUnsaved(null);
      onChange({
        ...opened,
        fileName: saved.fileName,
        format: saved.format,
        wasHarie: true,
        doc: saved.doc,
      });
    } catch (e) {
      setStatus(
        e instanceof DOMException && e.name === "AbortError" ? null : m.save.failed(String(e)),
      );
    } finally {
      setSaving(false);
    }
  };

  // 個人情報のマスクはベース画像そのものを書き換える（ADR-0007）。加工前の画像は保存するまでメモリにだけ持ち、
  // 保存したファイルには残さない（ADR-0009）
  const applyMasks = async (requested: PiiMask[]) => {
    const { width, height } = state.doc.canvas;
    const masks = masksInImage(requested, state.doc.canvas);
    const result = await (await browserRenderer()).applyMasks({
      base: opened.base,
      width,
      height,
      masks,
    });
    setUnsaved(
      addUnsaved(unsaved, { before: opened.base, pii: state.doc.pii }, masks, result.applied),
    );
    dispatch({ type: "piiApplied", pii: recordPiiApplied(state.doc, result.applied).pii });
    // 外部で編集された画像の「今の画像で開き直す」も、加工前の画像を持つので捨てる
    const { alternative: _, ...rest } = opened;
    onChange({ ...rest, base: result.base });
    setStatus(m.masks.applied(result.applied.length));
  };

  // 適用したマスクを外す。加工前の画像に、残りのマスクをかけ直す
  const unmask = async (id: string) => {
    if (unsaved === null) return;
    const { rest, pii } = removeUnsaved(unsaved, id);
    const { width, height } = state.doc.canvas;
    const base =
      rest.length === 0
        ? unsaved.before
        : (
            await (
              await browserRenderer()
            ).applyMasks({
              base: unsaved.before,
              width,
              height,
              masks: rest.map((e) => e.mask),
            })
          ).base;
    setUnsaved(rest.length === 0 ? null : { ...unsaved, entries: rest });
    dispatch({ type: "piiApplied", pii });
    onChange({ ...opened, base });
    setStatus(m.masks.unmasked);
  };

  // 注釈を残したまま、画像だけを新しいキャプチャに差し替える（FR-EDIT-10）。大きさが違えば注釈を比率で合わせる。
  // 元の画像にかけていたマスクは新しい画像にはかかっていないので、同じ範囲を下書きにしてかけ直してもらう（ADR-0007）
  const replaceBase = async (file: File) => {
    const next = readBaseImage(new Uint8Array(await file.arrayBuffer()));
    if (next === null) {
      setStatus(m.replace.notImage);
      return;
    }
    const { doc, previousPii } = rebaseDocument(state.doc, next);
    dispatch({
      type: "reset",
      doc,
      masks: addDetectedMasks(
        [],
        previousPii.map((p) => ({ ...p, replacement: "" })),
      ),
    });
    setUnsaved(null);
    setRebased(true);
    setShowWarning(false);
    const { alternative: _, warning: __, ...rest } = opened;
    onChange({ ...rest, base: { bytes: next.bytes, mediaType: next.mediaType } });
    const resized =
      next.width === state.doc.canvas.width && next.height === state.doc.canvas.height
        ? ""
        : m.replace.resized;
    setStatus(
      `${m.replace.done}${resized}${previousPii.length > 0 ? m.replace.remask(previousPii.length) : ""}`,
    );
  };

  // 保存（Ctrl / ⌘ + S）と画像を開く（Ctrl / ⌘ + O）は、文字の入力中でも効かせる（FR-EDIT-12）。
  // 入力中の文字は、入力欄を離れたときに確定するので、先に離れてから次の描画で保存する
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const mac = isMacPlatform();
    const onKey = (e: KeyboardEvent) => {
      if (matchesShortcut(e, "save", mac)) {
        e.preventDefault();
        if (saving) return;
        (document.activeElement as HTMLElement | null)?.blur?.();
        setTimeout(() => void saveRef.current(), 0);
      } else if (matchesShortcut(e, "open", mac) && onOpenImage !== undefined) {
        e.preventDefault();
        setConfirmOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onOpenImage]);

  return (
    <>
      <input
        ref={replaceInput}
        type="file"
        accept="image/jpeg,image/png"
        aria-label={m.replace.input}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file !== undefined) void replaceBase(file);
          e.target.value = "";
        }}
      />
      <Header
        fileName={opened.fileName}
        status={status}
        primary={
          <HeaderButton icon="save" variant="default" disabled={saving} onClick={save}>
            {m.save.button}
          </HeaderButton>
        }
        actions={[
          ...(onOpenImage === undefined
            ? []
            : [
                {
                  icon: "open",
                  label: m.open.button,
                  onSelect: () => setConfirmOpen(true),
                  placement: "start",
                } satisfies HeaderAction,
              ]),
          {
            icon: "replace",
            label: m.replace.button,
            onSelect: () => replaceInput.current?.click(),
            disabled: saving,
            placement: "start",
          },
          ...actions,
        ]}
        menu={<SaveFormatMenuItems value={format} onChange={setFormat} disabled={saving} />}
      >
        <SaveFormatMenu value={format} onChange={setFormat} disabled={saving} />
      </Header>
      <Modal open={confirmOpen} label={m.open.button} onClose={() => setConfirmOpen(false)}>
        <h2>{m.open.confirmTitle}</h2>
        <p>
          {m.open.confirmBody(opened.fileName)}
          {dirty && <strong>{m.open.confirmUnsaved}</strong>}
        </p>
        <p className="app-modal-actions">
          <button type="button" onClick={() => setConfirmOpen(false)}>
            {m.open.cancel}
          </button>
          <button
            type="button"
            className="app-primary"
            onClick={() => {
              setConfirmOpen(false);
              onOpenImage?.();
            }}
          >
            {m.open.choose}
          </button>
        </p>
      </Modal>
      <Modal
        open={shortcutsOpen}
        label={em.shortcuts.title}
        onClose={() => setShortcutsOpen(false)}
        className="app-shortcuts"
      >
        <h2>{em.shortcuts.title}</h2>
        <ShortcutList
          file={{ save: true, open: onOpenImage !== undefined }}
          element={elements.length > 0}
        />
        <p className="app-modal-actions">
          <button type="button" onClick={() => setShortcutsOpen(false)}>
            {em.shortcuts.close}
          </button>
        </p>
      </Modal>
      <main className="app-main">
        {showWarning && opened.warning !== undefined && (
          <div className="app-warning" role="alert">
            <p>{mismatchMessage(m, opened.warning)}</p>
            {opened.alternative !== undefined && (
              <p className="app-warning-actions">
                <button type="button" onClick={() => setShowWarning(false)}>
                  {m.load.keepAnnotations}
                </button>
                <button
                  type="button"
                  onClick={() => opened.alternative !== undefined && onReopen(opened.alternative)}
                >
                  {m.load.useCurrentImage}
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
          appliedMasks={unsaved?.entries.map((e) => ({ id: e.id, rect: e.record.rect })) ?? []}
          onUnmask={unmask}
          onShowShortcuts={() => setShortcutsOpen(true)}
          elements={elements}
          elementPixelRatio={dom?.viewport.devicePixelRatio ?? 1}
          {...(aiSuggest.action === null ? {} : { paletteActions: [aiSuggest.action] })}
          aside={aiSuggest.pendingCard}
          maskAside={
            <AiPiiPanel
              doc={state.doc}
              base={opened.base}
              {...(dom === undefined || rebased ? {} : { dom })}
              onPiiFound={(found) =>
                dispatch({ type: "masks", masks: addDetectedMasks(masksRef.current, found) })
              }
            />
          }
        />
        {aiSuggest.dialog}
      </main>
    </>
  );
}
