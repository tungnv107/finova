"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, WalletCards, Landmark, Smartphone, PiggyBank, Archive, Pencil, History, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/interaction-controls";
import { formatVnd } from "@/lib/money";

type Wallet = { id: string; name: string; type: string; currency: string; balance: string; archived: boolean; includeInAvailable: boolean };
type WalletDetail = { wallet: Wallet; asOf: string; cutoff: string; entries: {
  id: string; journalId: string; kind: string; occurredAt: string; transactionId: string | null; change: string;
}[]; nextCursor: string | null };
const types = [{ value: "CASH", label: "Tiền mặt" }, { value: "BANK", label: "Ngân hàng" }, { value: "EWALLET", label: "Ví điện tử" }, { value: "SAVINGS", label: "Tiết kiệm" }];
const icons = { CASH: WalletCards, BANK: Landmark, EWALLET: Smartphone, SAVINGS: PiggyBank };

export function WalletManager({ wallets, onboarding = false }: { wallets: Wallet[]; onboarding?: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(onboarding);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("CASH");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [editedAvailable, setEditedAvailable] = useState(true);
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const [actualBalance, setActualBalance] = useState("");
  const [reconcileReason, setReconcileReason] = useState("");
  const [reconcileMessage, setReconcileMessage] = useState("");
  const [reconcileHistory, setReconcileHistory] = useState<{ id: string; createdAt: string; expectedBalance: string; actualBalance: string; delta: string; reason: string }[]>([]);
  const reconciliationKey = useRef<string | null>(null);
  const [openingDate, setOpeningDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [detailWalletId, setDetailWalletId] = useState(wallets[0]?.id ?? "");
  const [detailDay, setDetailDay] = useState(openingDate);
  const [detail, setDetail] = useState<WalletDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);

  function invalidateDetail() {
    detailRequest.current += 1;
    setDetail(null);
    setDetailError("");
    setDetailLoading(false);
  }

  async function loadDetail(cursor?: string) {
    if (!detailWalletId) return;
    const requestId = ++detailRequest.current;
    setDetailLoading(true); setDetailError("");
    try {
      const params = new URLSearchParams({ asOf: detailDay });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/v1/wallets/${encodeURIComponent(detailWalletId)}?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Không thể đọc lịch sử sổ cái.");
      const next = result.data as WalletDetail;
      if (requestId !== detailRequest.current) return;
      setDetail(previous => cursor && previous ? { ...next, entries: [...previous.entries, ...next.entries] } : next);
    } catch (err) { if (requestId === detailRequest.current) setDetailError(err instanceof Error ? err.message : "Có lỗi kết nối."); }
    finally { if (requestId === detailRequest.current) setDetailLoading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/wallets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type, openingBalance, openingDate: `${openingDate}T00:00:00+07:00` }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Không tạo được ví.");
      setAdding(false); setName(""); setOpeningBalance("0");
      if (onboarding) router.replace("/dashboard");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Có lỗi kết nối."); }
    finally { setBusy(false); }
  }

  async function archive(id: string, archived: boolean) {
    if (!window.confirm(archived ? "Khôi phục ví này?" : "Lưu trữ ví này? Lịch sử giao dịch vẫn được giữ lại.")) return;
    setError(""); setBusy(true);
    try {
      const response = await fetch(`/api/v1/wallets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !archived }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "Không thể cập nhật ví.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Có lỗi kết nối."); }
    finally { setBusy(false); }
  }

  async function removeWallet(wallet: Wallet) {
    if (!window.confirm(`Xóa vĩnh viễn ví "${wallet.name}"? Số dư đầu kỳ (nếu có) sẽ được xóa khỏi sổ cái. Chỉ ví chưa phát sinh giao dịch hoặc liên kết khác mới có thể xóa. Không thể hoàn tác.`)) return;
    setBusy(true); setError(""); setDeleteMessage("");
    try {
      const response = await fetch(`/api/v1/wallets/${encodeURIComponent(wallet.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Không thể xóa ví.");
      if (editingId === wallet.id) setEditingId(null);
      if (reconcileId === wallet.id) setReconcileId(null);
      if (detailWalletId === wallet.id) { setDetailWalletId(wallets.find(w => w.id !== wallet.id)?.id ?? ""); invalidateDetail(); }
      setDeleteMessage(`Đã xóa ví "${wallet.name}".`);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Có lỗi kết nối."); }
    finally { setBusy(false); }
  }

  async function saveWallet(e: React.FormEvent, id: string) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch(`/api/v1/wallets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editedName, includeInAvailable: editedAvailable }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Không thể cập nhật ví.");
      setEditingId(null);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Có lỗi kết nối."); }
    finally { setBusy(false); }
  }

  async function startReconciliation(w: Wallet) {
    setReconcileId(w.id); setActualBalance(w.balance); setReconcileReason("");
    setReconcileMessage(""); setError(""); setReconcileHistory([]); reconciliationKey.current = null;
    try {
      const response = await fetch(`/api/v1/wallets/${encodeURIComponent(w.id)}/reconcile`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Không đọc được lịch sử đối soát.");
      setReconcileHistory(data.data);
    } catch (err) { setError(err instanceof Error ? err.message : "Không tải được lịch sử đối soát."); }
  }

  async function submitReconciliation(e: React.FormEvent) {
    e.preventDefault();
    const w = wallets.find(wallet => wallet.id === reconcileId);
    if (!w || !/^(0|[1-9]\d{0,15})$/.test(actualBalance) || reconcileReason.trim().length < 5) return;
    const delta = BigInt(actualBalance) - BigInt(w.balance);
    if (!window.confirm(`Xác nhận đối soát ${w.name}: số dư sổ ${formatVnd(w.balance)}, thực tế ${formatVnd(actualBalance)}, chênh lệch ${formatVnd(delta.toString())}? Khoản chênh lệch sẽ được hạch toán vào vốn điều chỉnh, không tính thu/chi.`)) return;
    setBusy(true); setError(""); setReconcileMessage("");
    reconciliationKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/wallets/${encodeURIComponent(w.id)}/reconcile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedBalance: w.balance, actualBalance, reason: reconcileReason.trim(), idempotencyKey: reconciliationKey.current }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Không thể đối soát số dư.");
      setReconcileMessage(`Đã ghi nhận chênh lệch ${formatVnd(data.data.delta)} và lưu lý do kiểm kê.`);
      setReconcileId(null); reconciliationKey.current = null;
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Có lỗi kết nối."); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-head"><div><h1 className="page-title">{onboarding ? "Thiết lập ví đầu tiên" : "Ví & tài khoản"}</h1><p className="subtitle">{onboarding ? "Bước 1/1: Tạo ví và nhập số dư hiện có để bắt đầu ghi chép." : "Quản lý số dư từ sổ cái của từng ví. Tiền chỉ ghi nhận khi thực sự phát sinh."}</p></div>{!onboarding && <button className="button button-primary" onClick={() => setAdding(!adding)}><Plus /> Tạo ví mới</button>}</div>
    {!onboarding && <section className="wallet-overview" aria-label="Tổng quan danh sách ví">
      <div className="wallet-overview-intro"><span className="eyebrow">VÍ & TÀI KHOẢN</span><h2>Tiền của bạn, rõ từng ví.</h2><p>Theo dõi số dư thực tế và đối soát với sổ cái. Số dư khả dụng theo kỳ được tính tại trang Tổng quan.</p></div>
      <div className="wallet-overview-stat"><strong>{wallets.filter(w => !w.archived).length}</strong><span>Ví đang hoạt động</span></div>
      <div className="wallet-overview-stat"><strong>{wallets.filter(w => !w.archived && w.includeInAvailable).length}</strong><span>Ví được tính khả dụng</span></div>
      <div className="wallet-overview-stat"><strong>{wallets.filter(w => w.archived).length}</strong><span>Ví đã lưu trữ</span></div>
    </section>}
    {adding && <form className="card card-pad" onSubmit={submit} style={{ marginBottom: 22 }}><div className="section-header"><h2 className="section-title">Thêm ví hoặc tài khoản</h2>{!onboarding && <button className="button button-outline" type="button" onClick={() => setAdding(false)}>Đóng</button>}</div><div className="form-grid" style={{ marginTop: 18 }}><div className="field"><label htmlFor="wallet-name">Tên ví</label><input id="wallet-name" required maxLength={80} placeholder="Ví dụ: Tiền mặt" value={name} onChange={e => setName(e.target.value)} /></div><div className="field"><label htmlFor="wallet-type">Loại ví</label><select id="wallet-type" value={type} onChange={e => setType(e.target.value)}>{types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div><div className="field"><label htmlFor="wallet-balance">Số dư đầu kỳ (₫)</label><input id="wallet-balance" required inputMode="numeric" pattern="[0-9]+" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} /></div><div className="field"><label htmlFor="wallet-date">Ngày bắt đầu</label><input id="wallet-date" type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} required /></div></div><p className="subtitle" style={{ fontSize: 12, marginTop: 13 }}>Số dư đầu kỳ được ghi vào vốn đầu kỳ, không tính là thu nhập.</p>{error && <div role="alert" className="form-error">{error}</div>}<div className="form-footer"><button disabled={busy} type="submit" className="button button-primary">{busy ? "Đang lưu…" : "Lưu ví"}</button></div></form>}
    {!adding && error && <div role="alert" className="form-error">{error}</div>}
    {deleteMessage && <p role="status" className="subtitle">{deleteMessage}</p>}
    {!wallets.length ? (onboarding ? null : <div className="empty"><WalletCards /><strong>Bạn chưa có ví nào</strong><p>Hãy tạo ví đầu tiên để bắt đầu ghi chép tài chính.</p><button className="button button-primary" onClick={() => setAdding(true)}>Tạo ví đầu tiên</button></div>) : <div className="wallet-grid">{wallets.map(w => { const Icon = icons[w.type as keyof typeof icons] || WalletCards; return <article key={w.id} className={`card wallet-card ${w.archived ? "wallet-card-archived" : ""}`}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><div className="kpi-icon"><Icon /></div><span className="pill">{types.find(t => t.value === w.type)?.label}{w.archived ? " · Đã lưu trữ" : ""}</span></div><h3 style={{ marginTop: 20 }}>{w.name}</h3><div className="wallet-balance">{formatVnd(w.balance)}</div>
      {editingId === w.id ? <form onSubmit={e => saveWallet(e, w.id)} style={{ marginBottom: 16 }}>
        <div className="field"><label htmlFor={`edit-wallet-${w.id}`}>Tên ví</label><input id={`edit-wallet-${w.id}`} value={editedName} onChange={e => setEditedName(e.target.value)} maxLength={80} required /></div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}><input type="checkbox" checked={editedAvailable} onChange={e => setEditedAvailable(e.target.checked)} /> Tính vào số dư khả dụng</label>
        <div className="form-footer" style={{ gap: 8 }}><button disabled={busy} type="button" className="button button-outline" onClick={() => setEditingId(null)}>Hủy</button><button disabled={busy} type="submit" className="button button-primary">{busy ? "Đang lưu…" : "Lưu thay đổi"}</button></div>
      </form> : <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}><span className="subtitle" style={{ fontSize: 12 }}>{w.includeInAvailable ? "Có trong số dư khả dụng" : "Không tính vào số dư khả dụng"}</span></div>}
      <div className="wallet-card-footer"><span className="subtitle" style={{ fontSize: 11 }}>Số dư sổ cái · {w.currency}</span><div className="wallet-card-actions"><button type="button" disabled={busy || w.archived} className="button button-outline" onClick={() => void startReconciliation(w)}>Đối soát</button>
<ActionMenu label={`Thao tác ví ${w.name}`} disabled={busy} items={[
  { label: "Xem lịch sử", icon: History, onSelect: () => { setDetailWalletId(w.id); invalidateDetail(); document.getElementById("wallet-history")?.scrollIntoView({ behavior: "smooth" }); } },
  { label: "Sửa ví", icon: Pencil, onSelect: () => { setEditingId(w.id); setEditedName(w.name); setEditedAvailable(w.includeInAvailable); setError(""); } },
  { label: w.archived ? "Khôi phục ví" : "Lưu trữ ví", icon: Archive, danger: !w.archived, onSelect: () => void archive(w.id, w.archived) },
  { label: "Xóa ví", icon: Trash2, danger: true, onSelect: () => void removeWallet(w) },
]} /></div></div></article>; })}</div>}
    {reconcileMessage && <p role="status" className="subtitle" style={{ marginTop: 14 }}>{reconcileMessage}</p>}
    {reconcileId && (() => { const w = wallets.find(wallet => wallet.id === reconcileId); if (!w) return null;
      const validAmount = /^(0|[1-9]\d{0,15})$/.test(actualBalance);
      const difference = validAmount ? (BigInt(actualBalance) - BigInt(w.balance)).toString() : null;
      return <section className="card card-pad" style={{ marginTop: 20 }} aria-label="Đối soát số dư thực tế"><div className="section-header"><div><h2 className="section-title">Đối soát · {w.name}</h2><p className="section-subtitle">Số dư sổ cái tại thời điểm mở biểu mẫu: {formatVnd(w.balance)}. Nếu có giao dịch mới, hệ thống sẽ yêu cầu tải lại.</p></div><button type="button" className="button button-outline" onClick={() => { setReconcileId(null); setError(""); }}>Đóng</button></div>
        <form onSubmit={e => void submitReconciliation(e)}><div className="form-grid" style={{ marginTop: 16 }}><div className="field"><label htmlFor="reconciliation-actual">Số dư thực tế (₫)</label><input id="reconciliation-actual" required inputMode="numeric" pattern="(0|[1-9][0-9]*)" value={actualBalance} onChange={e => { setActualBalance(e.target.value); reconciliationKey.current = null; }} /></div><div className="field"><label htmlFor="reconciliation-reason">Lý do đối soát (ít nhất 5 ký tự)</label><input id="reconciliation-reason" required minLength={5} maxLength={500} value={reconcileReason} onChange={e => { setReconcileReason(e.target.value); reconciliationKey.current = null; }} placeholder="Ví dụ: Kiểm kê tiền mặt cuối ngày" /></div></div>
          <p className="subtitle" style={{ marginTop: 12 }}>Chênh lệch: <strong>{difference === null ? "Số tiền không hợp lệ" : formatVnd(difference)}</strong>. Bút toán điều chỉnh ghi vào vốn đối soát, không làm tăng thu nhập hoặc chi phí.</p>
          {error && <div role="alert" className="form-error">{error}</div>}<div className="form-footer"><button type="submit" disabled={busy || !validAmount || reconcileReason.trim().length < 5} className="button button-primary">{busy ? "Đang lưu…" : "Xác nhận đối soát"}</button></div></form>
        <h3 style={{ marginTop: 24 }}>20 lần đối soát gần nhất</h3>{reconcileHistory.length ? <div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Số dư sổ</th><th>Thực tế</th><th>Chênh lệch</th><th>Lý do</th></tr></thead><tbody>{reconcileHistory.map(row => <tr key={row.id}><td>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(row.createdAt))}</td><td>{formatVnd(row.expectedBalance)}</td><td>{formatVnd(row.actualBalance)}</td><td>{formatVnd(row.delta)}</td><td>{row.reason}</td></tr>)}</tbody></table></div> : <p className="subtitle">Chưa có lần đối soát nào được ghi nhận.</p>}
      </section>; })()}
    {!onboarding && wallets.length > 0 && <section id="wallet-history" className="card card-pad" style={{ marginTop: 24 }} aria-label="Tra cứu số dư và lịch sử ví">
      <div className="section-header"><div><h2 className="section-title">Lịch sử số dư ví</h2><p className="section-subtitle">Số dư được đối chiếu trực tiếp từ bút toán sổ cái, tính đến ngày bạn chọn.</p></div></div>
      <form className="form-grid" onSubmit={e => { e.preventDefault(); void loadDetail(); }} style={{ marginTop: 16 }}>
        <div className="field"><label htmlFor="wallet-history-wallet">Ví cần xem</label><select id="wallet-history-wallet" value={detailWalletId} onChange={e => { setDetailWalletId(e.target.value); invalidateDetail(); }}>
          {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select></div>
        <div className="field"><label htmlFor="wallet-history-date">Số dư đến hết ngày</label><input id="wallet-history-date" type="date" required max={openingDate} value={detailDay} onChange={e => { setDetailDay(e.target.value); invalidateDetail(); }} /></div>
        <div className="field" style={{ justifyContent: "end" }}><button type="submit" disabled={detailLoading} className="button button-soft">{detailLoading ? "Đang tải…" : "Xem số dư và lịch sử"}</button></div>
      </form>
      {detailLoading && <p role="status" className="subtitle">Đang tải dữ liệu sổ cái…</p>}
      {detailError && <div role="alert" className="form-error">{detailError} <button type="button" className="button button-outline" disabled={detailLoading} onClick={() => void loadDetail()}>Thử lại</button></div>}
      {detail && <div style={{ marginTop: 18 }}>
        <div className="section-header"><div><strong>{detail.wallet.name}</strong><p className="section-subtitle">Số dư tính đến {detail.asOf} · {detail.wallet.currency}</p></div><strong className="wallet-balance">{formatVnd(detail.wallet.balance)}</strong></div>
        {detail.entries.length ? <div className="table-wrap"><table><thead><tr><th>Thời điểm</th><th>Loại bút toán</th><th>Biến động ví</th></tr></thead><tbody>
          {detail.entries.map(row => <tr key={row.id}><td>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(row.occurredAt))}</td>
            <td>{row.transactionId ? <a className="text-link" href={`/transactions?transactionId=${encodeURIComponent(row.transactionId)}`}>Giao dịch · {row.kind}</a> : row.kind === "OPENING" ? "Số dư đầu kỳ" : row.kind === "RECONCILIATION" ? "Điều chỉnh đối soát" : row.kind}</td>
            <td className={row.change.startsWith("-") ? "amount-expense" : "amount-income"}>{formatVnd(row.change)}</td></tr>)}
        </tbody></table></div> : <div className="empty"><strong>Chưa có bút toán</strong><p>Ví không phát sinh số dư hay giao dịch trong khoảng thời gian này.</p></div>}
        {detail.nextCursor && <button type="button" disabled={detailLoading} className="button button-outline" style={{ marginTop: 14 }} onClick={() => void loadDetail(detail.nextCursor!)}>Xem thêm lịch sử</button>}
      </div>}
    </section>}
  </>;
}
