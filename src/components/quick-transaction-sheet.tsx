"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, X } from "lucide-react";

type Kind = "INCOME" | "EXPENSE" | "TRANSFER";
type Wallet = { id: string; name: string; archived: boolean };
type Category = { id: string; name: string; kind: string; archived?: boolean };
const actions: { kind: Kind; title: string; icon: typeof ArrowDownLeft }[] = [
  { kind: "EXPENSE", title: "Chi tiền", icon: ArrowUpRight },
  { kind: "INCOME", title: "Thu tiền", icon: ArrowDownLeft },
  { kind: "TRANSFER", title: "Chuyển ví", icon: ArrowLeftRight },
];

export function QuickTransactionSheet({ open, onClose, initialKind = "EXPENSE" }: { open: boolean; onClose: () => void; initialKind?: Kind }) {
  if (!open) return null;
  return <QuickTransactionDialog key={initialKind} initialKind={initialKind} onClose={onClose} />;
}

function QuickTransactionDialog({ onClose, initialKind }: { onClose: () => void; initialKind: Kind }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [walletId, setWalletId] = useState("");
  const [destinationWalletId, setDestinationWalletId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [feeAmount, setFeeAmount] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = originalOverflow; document.removeEventListener("keydown", keydown); previousFocus.current?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetch("/api/v1/wallets", { signal: controller.signal }), fetch("/api/v1/categories", { signal: controller.signal })])
      .then(async ([w, c]) => { if (!w.ok || !c.ok) throw new Error("Không tải được ví và danh mục."); const [walletResult, categoryResult] = await Promise.all([w.json(), c.json()]); return [walletResult.data as Wallet[], categoryResult.data as Category[]] as const; })
      .then(([w, c]) => { const active = w.filter(x => !x.archived); setWallets(active); setCategories(c.filter(x => !x.archived)); setWalletId(active[0]?.id ?? ""); setDestinationWalletId(active[1]?.id ?? ""); })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadAttempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (kind === "TRANSFER" && (!destinationWalletId || destinationWalletId === walletId)) throw new Error("Hãy chọn một ví nhận khác ví nguồn.");
      if (kind !== "TRANSFER" && !categories.some(c => c.id === categoryId && c.kind === kind)) throw new Error("Hãy chọn danh mục phù hợp với giao dịch.");
      const body = { kind, walletId, destinationWalletId: kind === "TRANSFER" ? destinationWalletId : undefined, categoryId: kind !== "TRANSFER" ? categoryId : undefined, amount, feeAmount: kind === "TRANSFER" ? feeAmount : undefined, note, tags: [], occurredAt: new Date().toISOString() };
      const response = await fetch("/api/v1/transactions", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Không ghi được giao dịch.");
      setAmount(""); setNote(""); setCategoryId(""); setFeeAmount("0"); onClose(); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Không ghi được giao dịch."); }
    finally { setBusy(false); }
  }
  return <div className="sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-title" className="quick-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="section-header"><div><span className="eyebrow">GHI CHÉP NHANH</span><h2 id="quick-title" className="section-title">Thêm giao dịch</h2></div><button ref={closeRef} type="button" onClick={onClose} className="icon-button" aria-label="Đóng biểu mẫu"><X size={20} /></button></div>
      <div className="quick-kind-tabs">{actions.map(({ kind: k, title, icon: Icon }) => <button key={k} type="button" className={kind === k ? "selected" : ""} aria-pressed={kind === k} onClick={() => { setKind(k); setCategoryId(""); setError(""); }}><Icon size={20} aria-hidden="true" />{title}</button>)}</div>
      {loading ? <p className="subtitle" role="status">Đang tải ví và danh mục…</p> : loadError ? <div role="alert" className="quick-load-error"><p>Không tải được ví và danh mục. Vui lòng kiểm tra kết nối rồi thử lại.</p><button type="button" className="button button-outline" onClick={() => { setLoading(true); setLoadError(false); setLoadAttempt(value => value + 1); }}>Tải lại dữ liệu</button></div> : !wallets.length ? <p className="subtitle">Bạn cần tạo ví trước khi ghi giao dịch. <a className="text-link" href="/wallets">Quản lý ví →</a></p> : <form onSubmit={submit} className="quick-form">
        <div className="field"><label htmlFor="quick-amount">Số tiền (VND)</label><input id="quick-amount" required inputMode="numeric" pattern="[1-9][0-9]*" placeholder="Nhập số tiền" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <div className="field"><label htmlFor="quick-wallet">Ví nguồn</label><select id="quick-wallet" required value={walletId} onChange={e => { const next = e.target.value; setWalletId(next); if (destinationWalletId === next) setDestinationWalletId(wallets.find(w => w.id !== next)?.id ?? ""); }}>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        {kind === "TRANSFER" ? <><div className="field"><label htmlFor="quick-dest">Ví nhận</label><select id="quick-dest" required value={destinationWalletId} onChange={e => setDestinationWalletId(e.target.value)}><option value="">Chọn ví nhận</option>{wallets.filter(w => w.id !== walletId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div><div className="field"><label htmlFor="quick-fee">Phí chuyển tiền (VND)</label><input id="quick-fee" required inputMode="numeric" pattern="(0|[1-9][0-9]*)" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} /></div></> : <div className="field"><label htmlFor="quick-category">Danh mục</label><select id="quick-category" required value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Chọn danh mục</option>{categories.filter(c => c.kind === kind).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        <div className="field"><label htmlFor="quick-note">Ghi chú (không bắt buộc)</label><textarea id="quick-note" maxLength={1000} placeholder="Thêm mô tả cho giao dịch" value={note} onChange={e => setNote(e.target.value)} /></div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="button button-primary quick-submit" disabled={busy || (kind === "TRANSFER" && wallets.length < 2)} type="submit">{busy ? "Đang ghi sổ…" : "Lưu giao dịch"}</button>
      </form>}
    </div>
  </div>;
}
