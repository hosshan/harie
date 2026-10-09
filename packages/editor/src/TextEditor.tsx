// テキスト・吹き出しの文字を、編集面の上でその場で直す入力欄（FR-EDIT-03）
import type { Annotation } from "@harie/model";
import { annotationBounds, FONT_FAMILY, THEMES } from "@harie/render";
import { useEffect, useRef } from "react";

export type TextEditorProps = {
  annotation: Extract<Annotation, { type: "text" | "callout" }>;
  /** 画像の座標 → 編集面の要素内の画面座標。倍率 k と、縦横比を保った余白 ox / oy */
  frame: { k: number; ox: number; oy: number };
  /** 確定した文字（変わっていなくても呼ぶ）。入力欄を離れる・Ctrl / ⌘ + Enter で確定する */
  onCommit: (text: string) => void;
  /** Esc で取りやめる */
  onCancel: () => void;
};

export function TextEditor({ annotation, frame, onCommit, onCancel }: TextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // 確定・取りやめのあと、外れたときの blur で二重に確定しない
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const defaults = THEMES.default.defaults;
  const fontSize = annotation.style?.fontSize ?? defaults.fontSize;
  const b = annotationBounds(annotation);
  // 吹き出しは枠の内側の余白（描画の calloutLayout と同じ 0.6em）に合わせる
  const pad = annotation.type === "callout" ? fontSize * 0.6 : 0;
  const { k, ox, oy } = frame;

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(ref.current?.value ?? annotation.text);
    else onCancel();
  };

  return (
    <textarea
      ref={ref}
      className="harie-text-editor"
      aria-label="テキストを編集"
      title="Ctrl / ⌘ + Enter で確定、Esc で取りやめ"
      defaultValue={annotation.text}
      rows={Math.max(1, annotation.text.split("\n").length)}
      style={{
        left: ox + (b.x + pad) * k,
        top: oy + (b.y + pad) * k,
        minWidth: Math.max(b.w - pad * 2, fontSize * 4) * k,
        ...(annotation.type === "callout" ? { width: (b.w - pad * 2) * k } : {}),
        fontFamily: `"${FONT_FAMILY}", sans-serif`,
        fontSize: fontSize * k,
        fontWeight: annotation.style?.fontWeight === "bold" ? 700 : 400,
        color: annotation.style?.color ?? defaults.color,
      }}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          finish(true);
        }
      }}
    />
  );
}
