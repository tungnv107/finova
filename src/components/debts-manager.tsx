"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { HandCoins, Plus } from "lucide-react";
import { formatVnd } from "@/lib/money";
import type { listDebts } from "@/server/debts";

type Debt = Awaited<ReturnType<typeof listDebts>>[number];
type Wallet = { id: string; name: string; balance: string };
type Edit = { counterparty: string; dueDate: string; note: string };
const empty = (walletId: string, today: string) => ({ direction: "BORROW", counterparty: "", walletId, principal: "", annualRate: "0", installmentCount: "1", startDate: today, dueDate: "", note: "" });

export function DebtsManager({ debts, wallets, today }: { debts: Debt[]; wallets: Wallet[]; today: string }) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState(empty(wallets[0]?.id ?? "", today));
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit>({ counterparty: "", dueDate: "", note: "" });
  const [paying, setPaying] = useState<string | null>(null);
  const [payment, setPayment] = useState({ walletId: wallets[0]?.id ?? "", principal: "0", interest: "0", date: today });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function send(url: string, method: "POST" | "PATCH", body: object, idempotent = false) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(idempotent ? { "Idempotency-Key": crypto.randomUUID() } : {}) }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "Không thể lưu nghiệp vụ.");
    return data.data;
  }
  async function execute(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await action(); setSuccess(message); setShowCreate(false); setEditing(null); setPaying(null); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  function beginEdit(d: Debt) { setEditing(d.id); setPaying(null); setShowCreate(false); setError(""); setEdit({ counterparty: d.counterparty, dueDate: d.dueDate ?? "", note: d.note ?? "" }); }
  function beginPayment(d: Debt) { setPaying(d.id); setEditing(null); setShowCreate(false); setError(""); setPayment({ walletId: d.walletId, principal: d.remaining, interest: "0", date: today }); }
  function create(e: FormEvent) {
    e.preventDefault();
    void execute(() => send("/api/v1/debts", "POST", { ...form, annualRate: Number(form.annualRate), installmentCount: Number(form.installmentCount), dueDate: form.dueDate || null }), "Đã ghi nhận hợp đồng và bút toán gốc.");
  }
  function saveEdit(e: FormEvent, id: string) {
    e.preventDefault();
    void execute(() => send(`/api/v1/debts/${id}`, "PATCH", { ...edit, dueDate: edit.dueDate || null }), "Đã cập nhật khoản vay/nợ.");
  }
  function savePayment(e: FormEvent, id: string) {
    e.preventDefault();
    void execute(() => send(`/api/v1/debts/${id}/payments`, "POST", payment, true), "Đã ghi nhận thanh toán và cập nhật dư nợ.");
  }

  return <>
    <div className="page-head"><div><h1 className="page-title">Vay nợ & cho vay</h1><p className="subtitle">Theo dõi tiền gốc, lãi thực trả/thu và hạn thanh toán từ sổ cái.</p></div>
      <button className="button button-primary" disabled={busy || !wallets.length} onClick={() => { setForm(empty(wallets[0]?.id ?? "", today)); setShowCreate(v => !v); setEditing(null); setPaying(null); }}><Plus /> Khoản vay mới</button></div>
    <section className="card card-pad" style={{ marginBottom: 20, background: "#F3F7FF" }}><strong>Khoản vay không phải thu nhập; cho vay không phải chi phí.</strong><p className="subtitle">Gốc được theo dõi ở tài khoản phải thu/nợ phải trả. Chỉ phần lãi thực nhận hoặc thực trả được tính vào thu chi. Ước tính kỳ trả bên dưới mang tính tham khảo, chưa phải lịch khấu hao theo hợp đồng.</p></section>
    {error && <div role="alert" className="form-error" style={{ marginBottom: 18 }}>{error}</div>}
    {success && <div role="status" className="form-success" style={{ marginBottom: 18 }}>{success}</div>}
    {showCreate && <form className="card card-pad" onSubmit={create} style={{ marginBottom: 20 }}>
      <div className="section-header"><h2 className="section-title">Ghi nhận khoản vay/cho vay</h2><button type="button" className="button button-outline" onClick={() => setShowCreate(false)}>Đóng</button></div>
      <div className="form-grid" style={{ marginTop: 17 }}>
        <div className="field"><label htmlFor={`${fieldPrefix}-debt-1`}>Loại</label><select id={`${fieldPrefix}-debt-1`} value={form.direction} onChange={e => setForm(v => ({ ...v, direction: e.target.value }))}><option value="BORROW">Tôi đi vay (nợ phải trả)</option><option value="LEND">Tôi cho vay (phải thu)</option></select></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-debt-2`}>Đối tác / người liên quan</label><input id={`${fieldPrefix}-debt-2`} required maxLength={120} value={form.counterparty} onChange={e => setForm(v => ({ ...v, counterparty: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-debt-3`}>Ví giải ngân</label><select id={`${fieldPrefix}-debt-3`} required value={form.walletId} onChange={e => setForm(v => ({ ...v, walletId: e.target.value }))}>{wallets.map(w => <option key={w.id} value={w.id}>{w.name} · {formatVnd(w.balance)}</option>)}</select></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-debt-4`}>Tiền gốc (₫)</label><input id={`${fieldPrefix}-debt-4`} required inputMode="numeric" pattern="[1-9][0-9]*" value={form.principal} onChange={e => setForm(v => ({ ...v, principal: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-debt-5`}>Lãi suất năm (%)</label><input id={`${fieldPrefix}-debt-5`} type="number" min="0" max="100" step="0.01" required value={form.annualRate} onChange={e => setForm(v => ({ ...v, annualRate: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-debt-6`}>Số kỳ trả dự kiến</label><input id={`${fieldPrefix}-debt-6`} type="number" min="1" max="360" required value={form.installmentCount} onChange={e => setForm(v => ({ ...v, installmentCount: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-debt-7`}>Ngày giải ngân</label><input id={`${fieldPrefix}-debt-7`} type="date" max={today} required value={form.startDate} onChange={e => setForm(v => ({ ...v, startDate: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-debt-8`}>Ngày đến hạn (nếu có)</label><input id={`${fieldPrefix}-debt-8`} type="date" min={form.startDate} value={form.dueDate} onChange={e => setForm(v => ({ ...v, dueDate: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-debt-9`}>Ghi chú</label><textarea id={`${fieldPrefix}-debt-9`} maxLength={500} value={form.note} onChange={e => setForm(v => ({ ...v, note: e.target.value }))} /></div>
      </div><div className="form-footer"><button disabled={busy} className="button button-primary">{busy ? "Đang lưu…" : "Ghi nhận"}</button></div>
    </form>}
    {!debts.length && <div className="card card-pad"><div className="empty"><HandCoins /><strong>Chưa có khoản vay/nợ</strong><span>Tạo hợp đồng đầu tiên để theo dõi dư gốc và lịch thanh toán.</span></div></div>}
    <div style={{ display: "grid", gap: 16 }}>
      {debts.map(d => <article key={d.id} className="card card-pad module-record module-debt-account">
        <div className="section-header"><div><h2 className="section-title">{d.counterparty}</h2><p className="subtitle">{d.direction === "BORROW" ? "Đi vay" : "Cho vay"} · {d.walletName} · Giải ngân {d.startDate}</p></div><span className="pill">{d.settled ? "Đã tất toán" : d.overdue ? "Quá hạn" : "Đang theo dõi"}</span></div>
        <div className="finance-metrics"><div><span className="subtitle">Dư gốc</span><strong>{formatVnd(d.remaining)}</strong></div><div><span className="subtitle">Gốc ban đầu</span><strong>{formatVnd(d.principal)}</strong></div><div><span className="subtitle">Lãi suất năm</span><strong>{d.annualRate}%</strong></div><div><span className="subtitle">Ngày đến hạn</span><strong>{d.dueDate ?? "Chưa đặt"}</strong></div></div>
        <p className="subtitle" style={{ marginTop: 13 }}>Ước tính tham khảo: gốc/kỳ {formatVnd(d.principalInstallmentEstimate)} · lãi tháng hiện tại {formatVnd(d.monthlyInterestEstimate)}. Số kỳ khai báo: {d.installmentCount}.</p>
        {d.overdue && <p role="alert" className="form-error">Khoản này đã quá ngày đến hạn và vẫn còn dư gốc.</p>}
        {!d.settled && !d.overdue && d.daysUntilDue !== null && d.daysUntilDue <= 30 && <p role="status" className="subtitle">Sắp đến hạn: còn {d.daysUntilDue} ngày đến ngày {d.dueDate}. Hãy kiểm tra số phải trả theo hợp đồng.</p>}
        <div className="finance-actions"><button className="button button-outline" disabled={busy} onClick={() => beginEdit(d)}>Sửa thông tin</button>{!d.settled && <button className="button button-primary" disabled={busy || !wallets.length} onClick={() => beginPayment(d)}>{d.direction === "BORROW" ? "Trả gốc / lãi" : "Thu hồi gốc / lãi"}</button>}</div>
        {editing === d.id && <form onSubmit={e => saveEdit(e, d.id)} className="finance-inline-form"><div className="form-grid"><div className="field"><label htmlFor={`${fieldPrefix}-debt-10`}>Đối tác</label><input id={`${fieldPrefix}-debt-10`} required value={edit.counterparty} onChange={e => setEdit(v => ({ ...v, counterparty: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-11`}>Ngày hạn trả</label><input id={`${fieldPrefix}-debt-11`} type="date" min={d.startDate} value={edit.dueDate} onChange={e => setEdit(v => ({ ...v, dueDate: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-12`}>Ghi chú</label><textarea id={`${fieldPrefix}-debt-12`} maxLength={500} value={edit.note} onChange={e => setEdit(v => ({ ...v, note: e.target.value }))} /></div></div><div className="form-footer"><button type="button" className="button button-outline" onClick={() => setEditing(null)}>Hủy</button><button className="button button-primary" disabled={busy}>Lưu</button></div></form>}
        {paying === d.id && <form onSubmit={e => savePayment(e, d.id)} className="finance-inline-form"><div className="form-grid"><div className="field"><label htmlFor={`${fieldPrefix}-debt-13`}>Ví {d.direction === "BORROW" ? "chi trả" : "nhận tiền"}</label><select id={`${fieldPrefix}-debt-13`} required value={payment.walletId} onChange={e => setPayment(v => ({ ...v, walletId: e.target.value }))}>{wallets.map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-14`}>Tiền gốc (₫)</label><input id={`${fieldPrefix}-debt-14`} required inputMode="numeric" pattern="(0|[1-9][0-9]*)" value={payment.principal} onChange={e => setPayment(v => ({ ...v, principal: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-15`}>Tiền lãi (₫)</label><input id={`${fieldPrefix}-debt-15`} required inputMode="numeric" pattern="(0|[1-9][0-9]*)" value={payment.interest} onChange={e => setPayment(v => ({ ...v, interest: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-16`}>Ngày thanh toán</label><input id={`${fieldPrefix}-debt-16`} type="date" required min={d.startDate} max={today} value={payment.date} onChange={e => setPayment(v => ({ ...v, date: e.target.value }))} /></div></div><div className="form-footer"><button type="button" className="button button-outline" onClick={() => setPaying(null)}>Hủy</button><button className="button button-primary" disabled={busy}>Xác nhận bút toán</button></div></form>}
        <details style={{ marginTop: 18 }}><summary className="text-link">Lịch sử thanh toán ({d.payments.length})</summary>{d.payments.length ? <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Ví</th><th>Gốc</th><th>Lãi</th></tr></thead><tbody>{d.payments.map(p => <tr key={p.id}><td>{p.date}</td><td>{p.walletName}</td><td>{formatVnd(p.principal)}</td><td>{formatVnd(p.interest)}</td></tr>)}</tbody></table></div> : <p className="subtitle">Chưa có thanh toán.</p>}</details>
        <details style={{ marginTop: 15 }}><summary className="text-link">Kế hoạch trả gốc cố định ({d.installmentCount} kỳ dự kiến)</summary>
          <p className="subtitle">Dự phóng từ gốc ban đầu, lãi danh nghĩa năm chia 12 trên dư gốc giảm dần. Số thực tế theo lịch hợp đồng và các khoản đã thanh toán có thể khác; chỉ lịch sử thanh toán mới là số đã ghi sổ.</p>
          {d.projectedSchedule ? <div className="table-wrap"><table><thead><tr><th>Kỳ</th><th>Đến hạn dự kiến</th><th>Gốc</th><th>Lãi ước tính</th><th>Tổng</th><th>Gốc còn lại trong kế hoạch</th></tr></thead><tbody>{d.projectedSchedule.map(p => <tr key={p.installment}><td>{p.installment}</td><td>{p.dueDate}</td><td>{formatVnd(p.principal)}</td><td>{formatVnd(p.interest)}</td><td>{formatVnd(p.total)}</td><td>{formatVnd(p.remaining)}</td></tr>)}</tbody></table></div> : <div className="form-error">Không thể lập lịch trả hằng tháng: số kỳ khai báo khiến kỳ đầu tiên trước hoặc trùng ngày giải ngân. Cần kiểm tra lại điều khoản hợp đồng.</div>}
        </details>
      </article>)}
    </div>
  </>;
}
