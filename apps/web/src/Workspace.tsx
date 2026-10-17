// 開いた画像の編集画面。保存・個人情報のマスク・AI の提案と検出をまとめる（Web と Chrome 拡張で共通）
import type { DomSnapshot } from "@harie/ai";
import {
  addDetectedMasks,
  Editor,
  type MaskDraft,
  useEditorState,
  useObjectUrl,
} from "@harie/editor";
import type { ImageFormat } from "@harie/format";
import { type PiiMask, recordPiiApplied } from "@harie/model";
import { useEffect, useRef, useState } from "react";
import { AiPanel } from "./ai/AiPanel";
import { browserRenderer } from "./browser-renderer";
import { Header, type HeaderAction, HeaderButton } from "./Header";
import { mismatchMessage, type Opened } from "./load";
import { Modal } from "./Modal";
import { SaveFormatMenu, SaveFormatMenuItems } from "./SaveFormatMenu";
import { buildSaveFile, type Saved } from "./save";
import { addUnsaved, masksInImage, removeUnsaved, type UnsavedMasks } from "./unsaved-masks";

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
}: WorkspaceProps) {
  const [state, dispatch] = useEditorState(opened.doc);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [format, setFormat] = useState<ImageFormat>(opened.format);
  const [showWarning, setShowWarning] = useState(opened.warning !== undefined);
  const [masks, setMasks] = useState<MaskDraft[]>([]);
  // 保存するまでは、適用したマスクを外せるように加工前の画像を持つ（ADR-0009）
  const [unsaved, setUnsaved] = useState<UnsavedMasks | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const savedDoc = useRef(opened.doc);
  const dirty =
    state.doc.annotations !== savedDoc.current.annotations ||
    state.doc.pii !== savedDoc.current.pii;

  const baseImageUrl = useObjectUrl(opened.base.bytes, opened.base.mediaType);

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
      const saved = await buildSaveFile(opened, state.doc, format);
      await deliver(saved, opened);
      dispatch({ type: "saved", revision: saved.doc.revision, meta: saved.doc.meta });
      savedDoc.current = { ...state.doc, revision: saved.doc.revision };
      setStatus(`${saved.fileName} を保存しました`);
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
        e instanceof DOMException && e.name === "AbortError" ? null : `保存できませんでした: ${e}`,
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
    setStatus(
      `${result.applied.length} か所をマスクしました。保存するまでは、範囲を選んで隠すのをやめられます`,
    );
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
    setStatus("隠すのをやめました");
  };

  return (
    <>
      <Header
        fileName={opened.fileName}
        status={status}
        primary={
          <HeaderButton icon="save" variant="default" disabled={saving} onClick={save}>
            保存
          </HeaderButton>
        }
        actions={[
          ...(onOpenImage === undefined
            ? []
            : [
                {
                  icon: "open",
                  label: "画像を開く",
                  onSelect: () => setConfirmOpen(true),
                  placement: "start",
                } satisfies HeaderAction,
              ]),
          ...actions,
        ]}
        menu={<SaveFormatMenuItems value={format} onChange={setFormat} disabled={saving} />}
      >
        <SaveFormatMenu value={format} onChange={setFormat} disabled={saving} />
      </Header>
      <Modal open={confirmOpen} label="画像を開く" onClose={() => setConfirmOpen(false)}>
        <h2>別の画像を開きますか？</h2>
        <p>
          今の画像（{opened.fileName}）を閉じて、別の画像を開きます。
          {dirty && <strong>保存していない変更は失われます。</strong>}
        </p>
        <p className="app-modal-actions">
          <button type="button" onClick={() => setConfirmOpen(false)}>
            キャンセル
          </button>
          <button
            type="button"
            className="app-primary"
            onClick={() => {
              setConfirmOpen(false);
              onOpenImage?.();
            }}
          >
            画像を選ぶ
          </button>
        </p>
      </Modal>
      <main className="app-main">
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
          appliedMasks={unsaved?.entries.map((e) => ({ id: e.id, rect: e.record.rect })) ?? []}
          onUnmask={unmask}
          aside={
            <AiPanel
              doc={state.doc}
              dispatch={dispatch}
              base={opened.base}
              {...(dom === undefined ? {} : { dom })}
              onPiiFound={(found) => setMasks((current) => addDetectedMasks(current, found))}
            />
          }
        />
      </main>
    </>
  );
}
