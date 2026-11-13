// 保存する画像のサイズ（FR-EDIT-24, ADR-0018）。幅×高さを数値で決める。
// ベース画像と注釈の座標は変えず、保存・コピーのときだけこの大きさで描く。元に戻すで取り消せる
import {
  type HarieDocument,
  keepAspect,
  MAX_OUTPUT_SIDE,
  type OutputSize,
  outputSize,
  viewSize,
} from "@harie/model";
import { type FormEvent, useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useWebMessages } from "./messages";

/** よく使う倍率（Retina で撮った画像を 1 倍に戻す 50% など） */
const PRESETS = [25, 50, 75, 100] as const;

/** 入力欄の文字を大きさにする。1〜上限の整数でなければ null */
export function parseSide(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const v = Number(text.trim());
  return v >= 1 && v <= MAX_OUTPUT_SIDE ? v : null;
}

/** 決めた大きさを、ドキュメントに書く値にする。表示範囲と同じ大きさなら記録しない（null） */
export function toOutputSize(doc: HarieDocument, size: OutputSize): OutputSize | null {
  const view = viewSize(doc);
  return size.width === Math.round(view.width) && size.height === Math.round(view.height)
    ? null
    : size;
}

/** 今の書き出しの大きさが表示範囲と同じ縦横比か（1px の丸めは同じとみなす） */
function sameAspect(doc: HarieDocument): boolean {
  const out = outputSize(doc);
  const kept = keepAspect(doc, { width: out.width });
  return Math.abs(kept.height - out.height) <= 1;
}

export function ResizeDialog({
  open,
  doc,
  onClose,
  onApply,
}: {
  open: boolean;
  doc: HarieDocument;
  onClose: () => void;
  onApply: (size: OutputSize | null) => void;
}) {
  const m = useWebMessages();
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [lock, setLock] = useState(true);
  const view = viewSize(doc);
  const original = { width: Math.round(view.width), height: Math.round(view.height) };

  // 開くたびに、今の書き出しの大きさから始める
  useEffect(() => {
    if (!open) return;
    const out = outputSize(doc);
    setWidth(String(out.width));
    setHeight(String(out.height));
    setLock(sameAspect(doc));
  }, [open, doc]);

  const w = parseSide(width);
  const h = parseSide(height);
  const valid = w !== null && h !== null;

  const changeWidth = (text: string) => {
    setWidth(text);
    const v = parseSide(text);
    if (lock && v !== null) setHeight(String(keepAspect(doc, { width: v }).height));
  };
  const changeHeight = (text: string) => {
    setHeight(text);
    const v = parseSide(text);
    if (lock && v !== null) setWidth(String(keepAspect(doc, { height: v }).width));
  };
  const preset = (percent: number) => {
    const pw = Math.max(1, Math.round((original.width * percent) / 100));
    setWidth(String(pw));
    setHeight(String(keepAspect(doc, { width: pw }).height));
    setLock(true);
  };
  const toggleLock = (next: boolean) => {
    setLock(next);
    if (next && w !== null) setHeight(String(keepAspect(doc, { width: w }).height));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (w === null || h === null) return;
    onApply(toOutputSize(doc, { width: w, height: h }));
  };

  return (
    <Modal open={open} label={m.resize.title} onClose={onClose} className="app-resize">
      <form onSubmit={submit}>
        <h2>{m.resize.title}</h2>
        <p className="harie-muted">{m.resize.description}</p>
        <p className="harie-muted">{m.resize.original(original.width, original.height)}</p>
        <div className="app-resize-fields">
          <label>
            {m.resize.width}
            <input
              inputMode="numeric"
              value={width}
              aria-invalid={w === null}
              onChange={(e) => changeWidth(e.target.value)}
            />
          </label>
          <span aria-hidden="true" className="app-resize-times">
            ×
          </span>
          <label>
            {m.resize.height}
            <input
              inputMode="numeric"
              value={height}
              aria-invalid={h === null}
              onChange={(e) => changeHeight(e.target.value)}
            />
          </label>
          <span className="app-resize-unit">px</span>
        </div>
        <label className="app-resize-lock">
          <input type="checkbox" checked={lock} onChange={(e) => toggleLock(e.target.checked)} />
          {m.resize.keepAspect}
        </label>
        <div className="app-resize-presets">
          <span className="harie-muted">{m.resize.presets}</span>
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => preset(p)}>
              {p}%
            </button>
          ))}
        </div>
        {!valid && (
          <p className="app-resize-error" role="alert">
            {m.resize.invalid(MAX_OUTPUT_SIDE)}
          </p>
        )}
        <p className="app-modal-actions">
          <button type="button" onClick={onClose}>
            {m.resize.cancel}
          </button>
          <button type="submit" className="app-primary" disabled={!valid}>
            {m.resize.apply}
          </button>
        </p>
      </form>
    </Modal>
  );
}
