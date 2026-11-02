"use client";

import { createIdempotentRequest } from "@/lib/idempotent-request";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Clock3, HandCoins, Info, Pencil, Plus, Wallet } from "lucide-react";
import { IconButton } from "@/components/ui/interaction-controls";
import { Decimal, formatVnd } from "@/lib/money";
import type { listDebts } from "@/server/debts";
import styles from "./finance-pages.module.css";

type Debt = Awaited<ReturnType<typeof listDebts>>[number];
type Wallet = { id: string; name: string; balance: string };
type Edit = { counterparty: string; dueDate: string; note: string };
const empty = (walletId: string, today: string) => ({ direction: "BORROW", counterparty: "", walletId, principal: "", annualRate: "0", installmentCount: "1", startDate: today, dueDate: "", note: "" });

export function DebtsManager({ debts, wallets, today }: { debts: Debt[]; wallets: Wallet[]; today: string }) {
  const router = useRouter();
  const [sendIdempotent] = useState(createIdempotentRequest);
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
  const [view, setView] = useState<"ALL" | "BORROW" | "LEND" | "SETTLED">("ALL");
  const active = debts.filter(d => !d.settled);
  const total = (direction: string) => formatVnd(active.filter(d => d.direction === direction).reduce((sum, d) => sum.plus(d.remaining), new Decimal(0)).toFixed(0));
  const visible = debts.filter(d => view === "ALL" || (view === "SETTLED" ? d.settled : d.direction === view && !d.settled));
  useEffect(() => { if (showCreate || editing || paying) document.querySelector<HTMLInputElement | HTMLSelectElement>('[data-debt-editor] input, [data-debt-editor] select')?.focus(); }, [showCreate, editing, paying]);

  async function send(url: string, method: "POST" | "PATCH", body: object, idempotent = false) {
    if (idempotent) return sendIdempotent(url, body, method);
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>RÕ KHOẢN VAY, CHỦ ĐỘNG THANH TOÁN</span><h1>Vay nợ & cho vay</h1><p>Theo dõi khoản cần trả, khoản cần thu và từng lần thanh toán.</p></div>
      <button className="button button-primary" disabled={busy || !wallets.length} onClick={() => { setForm(empty(wallets[0]?.id ?? "", today)); setShowCreate(v => !v); setEditing(null); setPaying(null); setError(""); }}><Plus size={17} /> Khoản vay mới</button></header>
    <section className={`${styles.stats} ${styles.moneyStats}`} aria-label="Tổng quan vay nợ"><div className={`${styles.stat} ${styles.accentStat}`}><div className={styles.statTop}><span>Gốc còn phải trả</span><span className={`${styles.statIcon} ${styles.expense}`}><ArrowUpRight size={19} /></span></div><strong>{total("BORROW")}</strong><p>{active.filter(d => d.direction === "BORROW").length} khoản đi vay đang theo dõi</p></div><div className={styles.stat}><div className={styles.statTop}><span>Gốc còn phải thu</span><span className={`${styles.statIcon} ${styles.income}`}><ArrowDownLeft size={19} /></span></div><strong>{total("LEND")}</strong><p>{active.filter(d => d.direction === "LEND").length} khoản cho vay đang theo dõi</p></div><div className={styles.stat}><div className={styles.statTop}><span>Khoản quá hạn</span><span className={`${styles.statIcon} ${styles.warning}`}><Clock3 size={19} /></span></div><strong>{active.filter(d => d.overdue).length}</strong><p>Còn dư gốc sau ngày đến hạn</p></div></section>
    <div className={styles.note}><Info size={17} /><p><strong>Khoản vay không phải thu nhập; cho vay không phải chi phí.</strong> Chỉ phần lãi thực nhận hoặc thực trả được tính vào thu chi.</p></div>
    {!wallets.length && <div className={styles.note}><Wallet size={17} /><p><a className="text-link" href="/wallets">Tạo ví</a> để ghi nhận khoản vay và các lần thanh toán.</p></div>}
    {error && <div role="alert" className="form-error" style={{ marginBottom: 18 }}>{error}</div>}
    {success && <div role="status" className="form-success" style={{ marginBottom: 18 }}>{success}</div>}
    {showCreate && <form className={styles.editor} onSubmit={create} data-debt-editor aria-label="Ghi nhận khoản vay mới">
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
    <div className={styles.panelHead} style={{ padding: 0 }}><h2>Các khoản vay của bạn</h2><div className={styles.filters} role="group" aria-label="Lọc khoản vay">{([{ value: "ALL", label: "Tất cả" }, { value: "BORROW", label: "Đi vay" }, { value: "LEND", label: "Cho vay" }, { value: "SETTLED", label: "Đã tất toán" }] as const).map(option => <button type="button" key={option.value} aria-pressed={view === option.value} disabled={busy} onClick={() => { setView(option.value); setEditing(null); setPaying(null); }}>{option.label}</button>)}</div></div>
    {!visible.length && <div className={styles.panel}><div className={styles.empty}><span className={styles.emptyIcon}><HandCoins size={31} /></span><h3>{!debts.length ? "Chưa có khoản vay/nợ" : "Chưa có khoản nào trong nhóm này"}</h3><p>{!debts.length ? "Tạo hợp đồng đầu tiên để theo dõi dư gốc và lịch thanh toán." : "Chọn nhóm khác để xem các khoản đang theo dõi."}</p>{!!debts.length && <button className="button button-outline" onClick={() => setView("ALL")}>Xem tất cả</button>}</div></div>}
    <div className={styles.debtGrid}>
      {visible.map(d => {
        const progress = new Decimal(d.principal).gt(0) ? Decimal.max(0, Decimal.min(100, new Decimal(d.principal).minus(d.remaining).div(d.principal).mul(100))).toNumber() : 0;
        return <article key={d.id} className={styles.debtCard}>
        <div className={styles.debtHead}><span className={`${styles.rowIcon} ${d.direction === "BORROW" ? styles.expense : styles.income}`}>{d.direction === "BORROW" ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}</span><div><h2>{d.counterparty}</h2><p>{d.direction === "BORROW" ? "Đi vay" : "Cho vay"} · {d.walletName}</p></div><span className={`${styles.badge} ${d.settled ? styles.income : d.overdue ? styles.expense : styles.muted}`}>{d.settled ? "Đã tất toán" : d.overdue ? "Quá hạn" : "Đang theo dõi"}</span></div>
        <div className={styles.debtBalance}><span>{d.direction === "BORROW" ? "Dư gốc còn phải trả" : "Dư gốc còn phải thu"}</span><strong>{formatVnd(d.remaining)}</strong><p>Gốc ban đầu {formatVnd(d.principal)} · {d.startDate.split("-").reverse().join("/")}</p></div>
        <div className={styles.debtProgress} role="progressbar" aria-label={`Gốc đã thanh toán cho ${d.counterparty}`} aria-valuenow={Number(progress.toFixed(2))} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progress}%` }} /></div>
        <div className={styles.debtMeta}><div><span>Lãi suất năm</span><strong>{d.annualRate}%</strong></div><div><span>Ngày đến hạn</span><strong>{d.dueDate?.split("-").reverse().join("/") ?? "Chưa đặt"}</strong></div></div>
        {d.overdue && <p role="alert" className={styles.dueNote}>Khoản này đã quá ngày đến hạn và vẫn còn dư gốc.</p>}
        {!d.settled && !d.overdue && d.daysUntilDue !== null && d.daysUntilDue <= 30 && <p role="status" className={styles.dueNote}>Sắp đến hạn: còn {d.daysUntilDue} ngày đến ngày {d.dueDate}. Hãy kiểm tra số phải trả theo hợp đồng.</p>}
        <div className={styles.debtActions}>{!d.settled && <button className="button button-primary" disabled={busy || !wallets.length} onClick={() => beginPayment(d)}>{d.direction === "BORROW" ? "Trả gốc / lãi" : "Thu hồi gốc / lãi"}</button>}<IconButton label={`Sửa khoản ${d.counterparty}`} icon={Pencil} className="v4-menu-trigger" disabled={busy} onClick={() => beginEdit(d)} /></div>
        {editing === d.id && <form onSubmit={e => saveEdit(e, d.id)} className={styles.editor} data-debt-editor aria-label="Sửa khoản vay"><div className="form-grid"><div className="field"><label htmlFor={`${fieldPrefix}-debt-10`}>Đối tác</label><input id={`${fieldPrefix}-debt-10`} required value={edit.counterparty} onChange={e => setEdit(v => ({ ...v, counterparty: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-11`}>Ngày hạn trả</label><input id={`${fieldPrefix}-debt-11`} type="date" min={d.startDate} value={edit.dueDate} onChange={e => setEdit(v => ({ ...v, dueDate: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-12`}>Ghi chú</label><textarea id={`${fieldPrefix}-debt-12`} maxLength={500} value={edit.note} onChange={e => setEdit(v => ({ ...v, note: e.target.value }))} /></div></div><div className="form-footer"><button type="button" className="button button-outline" onClick={() => setEditing(null)}>Hủy</button><button className="button button-primary" disabled={busy}>Lưu</button></div></form>}
        {paying === d.id && <form onSubmit={e => savePayment(e, d.id)} className={styles.editor} data-debt-editor aria-label="Thanh toán khoản vay"><div className="form-grid"><div className="field"><label htmlFor={`${fieldPrefix}-debt-13`}>Ví {d.direction === "BORROW" ? "chi trả" : "nhận tiền"}</label><select id={`${fieldPrefix}-debt-13`} required value={payment.walletId} onChange={e => setPayment(v => ({ ...v, walletId: e.target.value }))}>{wallets.map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-14`}>Tiền gốc (₫)</label><input id={`${fieldPrefix}-debt-14`} required inputMode="numeric" pattern="(0|[1-9][0-9]*)" value={payment.principal} onChange={e => setPayment(v => ({ ...v, principal: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-15`}>Tiền lãi (₫)</label><input id={`${fieldPrefix}-debt-15`} required inputMode="numeric" pattern="(0|[1-9][0-9]*)" value={payment.interest} onChange={e => setPayment(v => ({ ...v, interest: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-debt-16`}>Ngày thanh toán</label><input id={`${fieldPrefix}-debt-16`} type="date" required min={d.startDate} max={today} value={payment.date} onChange={e => setPayment(v => ({ ...v, date: e.target.value }))} /></div></div><div className="form-footer"><button type="button" className="button button-outline" onClick={() => setPaying(null)}>Hủy</button><button className="button button-primary" disabled={busy}>Xác nhận bút toán</button></div></form>}
        <details className={styles.details}><summary>Lịch sử thanh toán ({d.payments.length})<ChevronDown size={15} /></summary>{d.payments.length ? <div className="table-wrap" role="region" aria-label={`Lịch sử thanh toán ${d.counterparty}`} tabIndex={0}><table><thead><tr><th>Ngày</th><th>Ví</th><th>Gốc</th><th>Lãi</th></tr></thead><tbody>{d.payments.map(p => <tr key={p.id}><td>{p.date}</td><td>{p.walletName}</td><td>{formatVnd(p.principal)}</td><td>{formatVnd(p.interest)}</td></tr>)}</tbody></table></div> : <p>Chưa có thanh toán.</p>}</details>
        <details className={styles.details}><summary>Kế hoạch trả gốc cố định ({d.installmentCount} kỳ dự kiến)<ChevronDown size={15} /></summary>
          <p>Ước tính tham khảo: gốc/kỳ {formatVnd(d.principalInstallmentEstimate)} · lãi tháng hiện tại {formatVnd(d.monthlyInterestEstimate)}. Số kỳ khai báo: {d.installmentCount}.</p>
          <p className="subtitle">Dự phóng từ gốc ban đầu, lãi danh nghĩa năm chia 12 trên dư gốc giảm dần. Số thực tế theo lịch hợp đồng và các khoản đã thanh toán có thể khác; chỉ lịch sử thanh toán mới là số đã ghi sổ.</p>
          {d.projectedSchedule ? <div className="table-wrap" role="region" aria-label={`Kế hoạch thanh toán ${d.counterparty}`} tabIndex={0}><table><thead><tr><th>Kỳ</th><th>Đến hạn dự kiến</th><th>Gốc</th><th>Lãi ước tính</th><th>Tổng</th><th>Gốc còn lại trong kế hoạch</th></tr></thead><tbody>{d.projectedSchedule.map(p => <tr key={p.installment}><td>{p.installment}</td><td>{p.dueDate}</td><td>{formatVnd(p.principal)}</td><td>{formatVnd(p.interest)}</td><td>{formatVnd(p.total)}</td><td>{formatVnd(p.remaining)}</td></tr>)}</tbody></table></div> : <div className="form-error">Không thể lập lịch trả hằng tháng: số kỳ khai báo khiến kỳ đầu tiên trước hoặc trùng ngày giải ngân. Cần kiểm tra lại điều khoản hợp đồng.</div>}
        </details>
      </article>; })}
    </div>
  </div>;
}
