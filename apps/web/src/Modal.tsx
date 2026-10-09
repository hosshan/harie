// 画面の上に重ねるダイアログ（<dialog> の showModal）。Esc で閉じる
import { type ReactNode, useEffect, useRef } from "react";

export type ModalProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

export function Modal({ open, label, onClose, className, children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d === null) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={`app-modal ${className ?? ""}`}
      aria-label={label}
      onClose={onClose}
    >
      {open && children}
    </dialog>
  );
}
