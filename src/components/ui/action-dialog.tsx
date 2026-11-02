"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal provides focus containment, an inert background and Escape handling. */
export function ActionDialog({ title, description, confirmLabel, danger = false, amount, onConfirm, onClose }: {
  title: string; description: ReactNode; confirmLabel: string; danger?: boolean;
  amount?: { initial: string; label: string; hint?: string };
  onConfirm: (value: string) => Promise<unknown>; onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const [value, setValue] = useState(amount?.initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    cancel.current?.focus();
    return () => { node?.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  function close() { if (!saving.current) onClose(); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try { await onConfirm(value); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thể lưu thay đổi. Vui lòng thử lại."); }
    finally { saving.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="action-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="action-dialog-heading"><h2 id={`${id}-title`}>{title}</h2><button type="button" className="v4-icon-button" aria-label="Đóng hộp thoại" disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <div id={`${id}-description`} className="action-dialog-description">{description}</div>
    <form onSubmit={submit} aria-busy={busy}>
      {amount && <div className="field"><label htmlFor={`${id}-amount`}>{amount.label}</label><input id={`${id}-amount`} required inputMode="numeric" pattern="[1-9][0-9]{0,15}" value={value} disabled={busy} onChange={event => setValue(event.target.value)} aria-describedby={amount.hint ? `${id}-hint` : undefined} />{amount.hint && <small id={`${id}-hint`}>{amount.hint}</small>}</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {busy && <p className="subtitle" role="status">Đang lưu, vui lòng chờ hoàn tất…</p>}
      <div className="action-dialog-footer"><button ref={cancel} type="button" className="v4-secondary-text-button" disabled={busy} onClick={close}>Quay lại</button><button type="submit" className={`button ${danger ? "action-danger" : "button-primary"}`} disabled={busy}>{busy ? "Đang xử lý…" : confirmLabel}</button></div>
    </form>
  </dialog>;
}
