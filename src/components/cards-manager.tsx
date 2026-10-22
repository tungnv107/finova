"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { CreditCard, Plus } from "lucide-react";
import { formatVnd } from "@/lib/money";
import type { listCreditCards } from "@/server/credit-cards";

type Card = Awaited<ReturnType<typeof listCreditCards>>[number];
type Wallet = { id: string; name: string; balance: string };
type Category = { id: string; name: string };
const blankCard = () => ({ name: "", lastFour: "", creditLimit: "", openingDebt: "0", statementDay: "20", paymentDueDay: "10" });

export function CardsManager({ cards, wallets, categories, today }: { cards: Card[]; wallets: Wallet[]; categories: Category[]; today: string }) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(blankCard());
  const [editId, setEditId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", creditLimit: "", statementDay: "20", paymentDueDay: "10" });
  const [entry, setEntry] = useState({ kind: "PURCHASE", amount: "", categoryId: categories[0]?.id ?? "", walletId: wallets[0]?.id ?? "", originalEntryId: "", date: today, note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function send(url: string, method: "POST" | "PATCH", body: object, withKey = false) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(withKey ? { "Idempotency-Key": crypto.randomUUID() } : {}) }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Không thể lưu nghiệp vụ thẻ.");
    return payload.data;
  }
  async function execute(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await action(); setSuccess(message); setShowCreate(false); setEditId(null); setEntryId(null); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  function create(e: FormEvent) { e.preventDefault(); void execute(() => send("/api/v1/cards", "POST", { ...form, lastFour: form.lastFour || null, statementDay: Number(form.statementDay), paymentDueDay: Number(form.paymentDueDay) }), "Đã tạo thẻ tín dụng."); }
  function update(e: FormEvent, id: string) { e.preventDefault(); void execute(() => send(`/api/v1/cards/${id}`, "PATCH", { ...edit, statementDay: Number(edit.statementDay), paymentDueDay: Number(edit.paymentDueDay) }), "Đã cập nhật thẻ."); }
  function saveEntry(e: FormEvent, id: string) {
    e.preventDefault();
    const common = { kind: entry.kind, amount: entry.amount, date: entry.date, note: entry.note };
    const body = entry.kind === "PURCHASE" ? { ...common, categoryId: entry.categoryId }
      : entry.kind === "REFUND" ? { ...common, originalEntryId: entry.originalEntryId }
      : { ...common, walletId: entry.walletId };
    void execute(() => send(`/api/v1/cards/${id}/entries`, "POST", body, true), "Đã ghi nhận giao dịch thẻ và cập nhật sổ cái.");
  }
  function beginEdit(c: Card) { setEditId(c.id); setEntryId(null); setShowCreate(false); setError(""); setEdit({ name: c.name, creditLimit: c.creditLimit, statementDay: String(c.statementDay), paymentDueDay: String(c.paymentDueDay) }); }
  function beginEntry(c: Card) { setEntryId(c.id); setEditId(null); setShowCreate(false); setError(""); setEntry({ kind: "PURCHASE", amount: "", categoryId: categories[0]?.id ?? "", walletId: wallets[0]?.id ?? "", originalEntryId: "", date: today, note: "" }); }

  return <>
    <div className="page-head feature-page-head"><div><h1 className="page-title">Thẻ tín dụng</h1><p className="subtitle">Hạn mức, dư nợ, mua hàng, hoàn tiền và thanh toán theo sổ cái.</p></div>
      <button className="button button-primary" disabled={busy} onClick={() => { setForm(blankCard()); setShowCreate(v => !v); setEditId(null); setEntryId(null); }}><Plus /> Thêm thẻ</button></div>
    <section className="card card-pad module-info-card" style={{ marginBottom: 20 }}><strong>Thanh toán thẻ là giảm dư nợ.</strong><p className="subtitle">Mua hàng được ghi nhận vào chi phí ngay tại ngày phát sinh. Trả tiền từ ví chỉ giảm nợ phải trả, không ghi chi phí lần thứ hai. Chu kỳ và hạn thanh toán hiển thị là dự kiến theo ngày cài đặt, không thay thế sao kê do ngân hàng phát hành.</p></section>
    {error && <div className="form-error" role="alert" style={{ marginBottom: 18 }}>{error}</div>}
    {success && <div className="form-success" role="status" style={{ marginBottom: 18 }}>{success}</div>}
    {showCreate && <form className="card card-pad" onSubmit={create} style={{ marginBottom: 20 }}>
      <div className="section-header"><h2 className="section-title">Thẻ tín dụng mới</h2><button className="button button-outline" type="button" onClick={() => setShowCreate(false)}>Đóng</button></div>
      <div className="form-grid" style={{ marginTop: 17 }}>
        <div className="field"><label htmlFor={`${fieldPrefix}-card-1`}>Tên thẻ</label><input id={`${fieldPrefix}-card-1`} required maxLength={100} value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} placeholder="Ví dụ: Visa ngân hàng A" /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-card-2`}>Bốn số cuối (tùy chọn)</label><input id={`${fieldPrefix}-card-2`} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.lastFour} onChange={e => setForm(v => ({ ...v, lastFour: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-card-3`}>Hạn mức (₫)</label><input id={`${fieldPrefix}-card-3`} required inputMode="numeric" pattern="[1-9][0-9]*" value={form.creditLimit} onChange={e => setForm(v => ({ ...v, creditLimit: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-card-4`}>Dư nợ đầu kỳ (₫)</label><input id={`${fieldPrefix}-card-4`} required inputMode="numeric" pattern="(0|[1-9][0-9]*)" value={form.openingDebt} onChange={e => setForm(v => ({ ...v, openingDebt: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-card-5`}>Ngày chốt sao kê mỗi tháng (1–28)</label><input id={`${fieldPrefix}-card-5`} type="number" min="1" max="28" required value={form.statementDay} onChange={e => setForm(v => ({ ...v, statementDay: e.target.value }))} /></div>
        <div className="field"><label htmlFor={`${fieldPrefix}-card-6`}>Ngày hạn thanh toán mỗi tháng (1–28)</label><input id={`${fieldPrefix}-card-6`} type="number" min="1" max="28" required value={form.paymentDueDay} onChange={e => setForm(v => ({ ...v, paymentDueDay: e.target.value }))} /></div>
      </div><div className="form-footer"><button disabled={busy} className="button button-primary">{busy ? "Đang lưu…" : "Tạo thẻ"}</button></div>
    </form>}
    {!cards.length && <section className="card card-pad"><div className="empty"><CreditCard /><strong>Chưa có thẻ tín dụng</strong><span>Thêm thẻ để bắt đầu theo dõi hạn mức và dư nợ.</span></div></section>}
    <div style={{ display: "grid", gap: 16 }}>
      {cards.map(c => <article className="card card-pad module-record module-card-account" key={c.id}>
        <div className="section-header"><div><h2 className="section-title">{c.name}{c.lastFour ? ` •••• ${c.lastFour}` : ""}</h2><p className="subtitle">Chốt sao kê ngày {c.statementDay} · Thanh toán ngày {c.paymentDueDay} hằng tháng</p></div><span className="pill">{Number(c.outstanding) ? "Có dư nợ" : "Đã thanh toán"}</span></div>
        <div className="finance-metrics"><div><span className="subtitle">Dư nợ hiện tại</span><strong>{formatVnd(c.outstanding)}</strong></div><div><span className="subtitle">Hạn mức</span><strong>{formatVnd(c.creditLimit)}</strong></div><div><span className="subtitle">Hạn mức còn lại</span><strong>{formatVnd(c.available)}</strong></div><div><span className="subtitle">Mua ròng chu kỳ hiện tại</span><strong>{formatVnd(c.currentCycleNetPurchases)}</strong></div></div>
        <p className="subtitle" style={{ marginTop: 14 }}>Dư nợ tại ngày chốt gần nhất ({c.lastStatementDate}): <strong>{formatVnd(c.lastStatementBalance)}</strong> · Ước tính còn lại của sao kê: <strong>{formatVnd(c.estimatedStatementRemaining)}</strong> · Ngày đến hạn dự kiến: {c.lastPaymentDueDate}.</p>
        <p className="subtitle">Ước tính còn lại trừ các thanh toán sau chốt và hoàn tiền thuộc giao dịch mua trước chốt; không trừ hoàn tiền của giao dịch mua trong kỳ mới. Kỳ tiếp theo dự kiến chốt {c.nextStatementDate}, thanh toán {c.projectedPaymentDueDate}. Đây là phép tính từ sổ cái Finova, chưa tính điều chỉnh ngân hàng, phí và số thanh toán tối thiểu chính thức.</p>
        <div className="finance-actions"><button disabled={busy} className="button button-outline" onClick={() => beginEdit(c)}>Sửa thẻ</button><button disabled={busy} className="button button-primary" onClick={() => beginEntry(c)}>Thêm giao dịch</button></div>
        {editId === c.id && <form className="finance-inline-form" onSubmit={e => update(e, c.id)}><div className="form-grid"><div className="field"><label htmlFor={`${fieldPrefix}-card-7`}>Tên thẻ</label><input id={`${fieldPrefix}-card-7`} required value={edit.name} onChange={e => setEdit(v => ({ ...v, name: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-card-8`}>Hạn mức</label><input id={`${fieldPrefix}-card-8`} required inputMode="numeric" pattern="[1-9][0-9]*" value={edit.creditLimit} onChange={e => setEdit(v => ({ ...v, creditLimit: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-card-9`}>Ngày sao kê</label><input id={`${fieldPrefix}-card-9`} type="number" min="1" max="28" required value={edit.statementDay} onChange={e => setEdit(v => ({ ...v, statementDay: e.target.value }))} /></div><div className="field"><label htmlFor={`${fieldPrefix}-card-10`}>Ngày thanh toán</label><input id={`${fieldPrefix}-card-10`} type="number" min="1" max="28" required value={edit.paymentDueDay} onChange={e => setEdit(v => ({ ...v, paymentDueDay: e.target.value }))} /></div></div><div className="form-footer"><button type="button" className="button button-outline" onClick={() => setEditId(null)}>Hủy</button><button disabled={busy} className="button button-primary">Lưu</button></div></form>}
        {entryId === c.id && <form className="finance-inline-form" onSubmit={e => saveEntry(e, c.id)}><div className="form-grid">
          <div className="field"><label htmlFor={`${fieldPrefix}-card-11`}>Nghiệp vụ</label><select id={`${fieldPrefix}-card-11`} value={entry.kind} onChange={e => setEntry(v => ({ ...v, kind: e.target.value, originalEntryId: "" }))}><option value="PURCHASE">Mua hàng (tăng dư nợ)</option><option value="PAYMENT">Thanh toán từ ví</option><option value="REFUND">Hoàn tiền mua hàng</option></select></div>
          <div className="field"><label htmlFor={`${fieldPrefix}-card-12`}>Số tiền (₫)</label><input id={`${fieldPrefix}-card-12`} required inputMode="numeric" pattern="[1-9][0-9]*" value={entry.amount} onChange={e => setEntry(v => ({ ...v, amount: e.target.value }))} /></div>
          {entry.kind === "PURCHASE" && <div className="field"><label htmlFor={`${fieldPrefix}-card-13`}>Danh mục chi tiêu</label><select id={`${fieldPrefix}-card-13`} required value={entry.categoryId} onChange={e => setEntry(v => ({ ...v, categoryId: e.target.value }))}>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select>{!categories.length && <span className="subtitle">Hãy tạo danh mục chi trước khi mua hàng bằng thẻ.</span>}</div>}
          {entry.kind === "PAYMENT" && <div className="field"><label htmlFor={`${fieldPrefix}-card-14`}>Ví thanh toán</label><select id={`${fieldPrefix}-card-14`} required value={entry.walletId} onChange={e => setEntry(v => ({ ...v, walletId: e.target.value }))}>{wallets.map(w => <option value={w.id} key={w.id}>{w.name} · {formatVnd(w.balance)}</option>)}</select></div>}
          {entry.kind === "REFUND" && <div className="field"><label htmlFor={`${fieldPrefix}-card-15`}>Giao dịch mua gốc</label><select id={`${fieldPrefix}-card-15`} required value={entry.originalEntryId} onChange={e => setEntry(v => ({ ...v, originalEntryId: e.target.value }))}><option value="">Chọn giao dịch</option>{c.entries.filter(x => x.kind === "PURCHASE").map(x => <option key={x.id} value={x.id}>{x.date} · {x.categoryName ?? "Mua hàng"} · {formatVnd(x.amount)}</option>)}</select><span className="subtitle">Danh sách hiển thị 60 giao dịch gần nhất. API kiểm tra số tiền được phép hoàn.</span></div>}
          <div className="field"><label htmlFor={`${fieldPrefix}-card-16`}>Ngày giao dịch</label><input id={`${fieldPrefix}-card-16`} type="date" required max={today} value={entry.date} onChange={e => setEntry(v => ({ ...v, date: e.target.value }))} /></div>
          <div className="field"><label htmlFor={`${fieldPrefix}-card-17`}>Ghi chú</label><input id={`${fieldPrefix}-card-17`} maxLength={300} value={entry.note} onChange={e => setEntry(v => ({ ...v, note: e.target.value }))} /></div>
        </div><div className="form-footer"><button type="button" className="button button-outline" onClick={() => setEntryId(null)}>Hủy</button><button disabled={busy || (entry.kind === "PURCHASE" && !categories.length) || (entry.kind === "PAYMENT" && !wallets.length)} className="button button-primary">Ghi nhận</button></div></form>}
        <details style={{ marginTop: 18 }}><summary className="text-link">Lịch sử nghiệp vụ gần đây ({c.entries.length})</summary>{c.entries.length ? <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Nghiệp vụ</th><th>Danh mục / ví</th><th>Giá trị</th></tr></thead><tbody>{c.entries.map(x => <tr key={x.id}><td>{x.date}</td><td>{x.kind === "PURCHASE" ? "Mua hàng" : x.kind === "PAYMENT" ? "Thanh toán" : "Hoàn tiền"}{x.note ? ` · ${x.note}` : ""}</td><td>{x.categoryName ?? x.walletName ?? "—"}</td><td>{formatVnd(x.amount)}</td></tr>)}</tbody></table></div> : <p className="subtitle">Chưa phát sinh giao dịch.</p>}</details>
      </article>)}
    </div>
  </>;
}
