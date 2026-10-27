"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, PiggyBank, Pencil, Archive, RotateCcw } from "lucide-react";
import { ActionMenu } from "@/components/ui/interaction-controls";
import { formatVnd } from "@/lib/money";
import type { listBudgetPerformance } from "@/server/budgets";

type Budget = Awaited<ReturnType<typeof listBudgetPerformance>>[number];
type CategoryOption = { id: string; name: string };
type Period = "MONTHLY" | "WEEKLY" | "CUSTOM";
type Scope = "TOTAL" | "CATEGORY" | "GROUP";
type Form = { name: string; period: Period; scope: Scope; start: string; endExclusive: string; limitAmount: string; categoryIds: string[] };

function plusDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function defaults(period: Period = "MONTHLY") {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10);
  if (period === "WEEKLY") {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const start = plusDays(date, -(weekday === 0 ? 6 : weekday - 1));
    return { start, endExclusive: plusDays(start, 7) };
  }
  const start = `${date.slice(0, 7)}-01`;
  const endExclusive = plusDays(`${date.slice(0, 7)}-28`, 7).slice(0, 7) + "-01";
  return period === "MONTHLY" ? { start, endExclusive } : { start: date, endExclusive: plusDays(date, 30) };
}

function emptyForm(): Form {
  return { name: "", period: "MONTHLY", scope: "CATEGORY", ...defaults(), limitAmount: "", categoryIds: [] };
}

export function BudgetManager({ initialBudgets, categories }: { initialBudgets: Budget[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function beginCreate() { setForm(emptyForm()); setEditing(null); setOpen(true); setError(""); }
  function beginEdit(b: Budget) {
    setForm({ name: b.name, period: b.period, scope: b.scope, start: b.start,
      endExclusive: b.endExclusive, limitAmount: b.limitAmount, categoryIds: b.categoryIds });
    setEditing(b.id); setOpen(true); setError("");
  }
  async function mutate(path: string, method: "POST" | "PATCH", body: object) {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Không lưu được ngân sách.");
    return payload.data;
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await mutate(editing ? `/api/v1/budgets/${editing}` : "/api/v1/budgets", editing ? "PATCH" : "POST", form);
      setOpen(false); setEditing(null); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi kết nối."); }
    finally { setBusy(false); }
  }
  async function toggleArchive(b: Budget) {
    setBusy(true); setError("");
    try { await mutate(`/api/v1/budgets/${b.id}`, "PATCH", { archived: !b.archived }); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Có lỗi kết nối."); }
    finally { setBusy(false); }
  }
  const active = initialBudgets.filter(b => !b.archived);
  const exceededCount = active.filter(b => Number(b.percent) > 100).length;

  return <>
    <div className="page-head feature-page-head"><div><h1 className="page-title">Ngân sách</h1><p className="subtitle">Theo dõi hạn mức từ giao dịch thực, đã trừ hoàn tiền và bút toán đảo.</p></div>
      <button className="button button-primary" onClick={beginCreate}><Plus size={18} /> Tạo ngân sách</button></div>
    <section className="module-overview" aria-label="Tổng quan ngân sách">
      <div className="module-overview-copy"><span className="module-overview-eyebrow">KẾ HOẠCH CHI TIÊU</span><strong>Chủ động với từng hạn mức</strong><span>Mỗi ngân sách được theo dõi riêng để tránh cộng trùng các khoản chi.</span></div>
      <div className="module-overview-stats"><div><span>Đang sử dụng</span><strong>{active.length}</strong></div><div><span>Vượt hạn mức</span><strong>{exceededCount}</strong></div><div><span>Đã lưu trữ</span><strong>{initialBudgets.length - active.length}</strong></div></div>
    </section>

    {open && <form className="card card-pad" onSubmit={save} style={{ marginBottom: 20 }}>
      <div className="section-header"><h2 className="section-title">{editing ? "Cập nhật ngân sách" : "Tạo ngân sách mới"}</h2>
        <button type="button" className="button button-outline" onClick={() => { setOpen(false); setError(""); }}>Đóng</button></div>
      <div className="form-grid" style={{ marginTop: 18 }}>
        <div className="field"><label htmlFor="budget-name">Tên ngân sách</label><input id="budget-name" required maxLength={100} value={form.name} placeholder="Ví dụ: Ăn uống tháng này" onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="field"><label htmlFor="budget-limit">Hạn mức (₫)</label><input id="budget-limit" required type="number" min="1" max="9999999999999999" step="1" value={form.limitAmount} onChange={e => setForm(f => ({ ...f, limitAmount: e.target.value }))} /></div>
        <div className="field"><label htmlFor="budget-period">Kỳ ngân sách</label><select id="budget-period" value={form.period} onChange={e => { const period = e.target.value as Period; setForm(f => ({ ...f, period, ...defaults(period) })); }}><option value="MONTHLY">Theo tháng</option><option value="WEEKLY">Theo tuần (thứ Hai – Chủ nhật)</option><option value="CUSTOM">Khoảng tùy chọn</option></select></div>
        <div className="field"><label htmlFor="budget-scope">Phạm vi</label><select id="budget-scope" value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as Scope, categoryIds: [] }))}><option value="TOTAL">Tổng chi tiêu</option><option value="CATEGORY">Một danh mục</option><option value="GROUP">Nhóm danh mục</option></select></div>
        <div className="field"><label htmlFor="budget-start">Từ ngày (bao gồm)</label><input id="budget-start" required type="date" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} /></div>
        <div className="field"><label htmlFor="budget-end">Đến trước ngày</label><input id="budget-end" required type="date" value={form.endExclusive} onChange={e => setForm(f => ({ ...f, endExclusive: e.target.value }))} /></div>
      </div>
      {form.period !== "CUSTOM" && <p className="subtitle" style={{ marginTop: 10 }}>Kỳ tháng bắt đầu ngày 01; kỳ tuần bắt đầu thứ Hai. Có thể đổi ngày để chọn tháng hoặc tuần khác.</p>}
      {form.scope !== "TOTAL" && <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 12, marginTop: 18, padding: 16 }}>
        <legend style={{ fontWeight: 700 }}>Danh mục chi tiêu {form.scope === "GROUP" ? "(chọn từ 2)" : "(chọn 1)"}</legend>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {categories.map(category => <label key={category.id} style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><input type={form.scope === "CATEGORY" ? "radio" : "checkbox"} name="budget-category" checked={form.categoryIds.includes(category.id)} onChange={e => setForm(f => ({ ...f, categoryIds: f.scope === "CATEGORY" ? [category.id] : e.target.checked ? [...f.categoryIds, category.id] : f.categoryIds.filter(id => id !== category.id) }))} />{category.name}</label>)}
          {!categories.length && <span>Chưa có danh mục chi. Tạo danh mục trước khi lập ngân sách.</span>}
        </div>
      </fieldset>}
      {error && <div className="form-error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
      <div className="form-footer"><button className="button button-primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu ngân sách"}</button></div>
    </form>}

    {!open && error && <div className="form-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
    {active.length === 0 && <section className="card card-pad"><div className="empty"><PiggyBank size={34} /><strong>Chưa có ngân sách đang sử dụng</strong><span>Hãy tạo hạn mức đầu tiên để theo dõi chi tiêu từ sổ cái.</span></div></section>}
    {active.length > 0 && <p className="subtitle" style={{ marginBottom: 16 }}>Ngân sách tổng và ngân sách theo danh mục có thể bao phủ cùng khoản chi; các hạn mức được hiển thị riêng, không cộng gộp.</p>}
    <div style={{ display: "grid", gap: 16 }}>
      {initialBudgets.map(b => {
        const percent = Number(b.percent);
        const exceeded = percent > 100;
        const warning = percent >= 80;
        return <article className={`card card-pad module-record ${b.archived ? "module-record-archived" : ""}`} key={b.id}>
          <div className="section-header" style={{ gap: 12, alignItems: "flex-start" }}>
            <div><h2 className="section-title">{b.name}</h2><p className="subtitle">{b.start} → {b.endExclusive} (không gồm ngày cuối) · {b.scope === "TOTAL" ? "Tổng chi" : b.categories.map(c => c.name).join(", ")}</p></div>
            <span className="pill">{b.archived ? "Đã lưu trữ" : b.period === "MONTHLY" ? "Tháng" : b.period === "WEEKLY" ? "Tuần" : "Tùy chọn"}</span>
          </div>
          <div className="module-amount-row">
            <div><div className="subtitle">Đã sử dụng</div><strong className="module-primary-amount">{formatVnd(b.used)}</strong></div>
            <div><div className="subtitle">Hạn mức</div><strong>{formatVnd(b.limitAmount)}</strong></div>
            <div><div className="subtitle">{exceeded ? "Vượt hạn mức" : "Còn lại"}</div><strong className={exceeded ? "module-danger-text" : ""}>{formatVnd(exceeded ? b.remaining.replace("-", "") : b.remaining)}</strong></div>
          </div>
          <div className="module-progress" role="progressbar" aria-valuenow={Math.max(0, Math.min(100, percent))} aria-valuemin={0} aria-valuemax={100} aria-label={`Tiến độ ngân sách ${b.name}`}>
            <div className={`module-progress-fill ${exceeded ? "module-progress-danger" : warning ? "module-progress-warning" : ""}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            <strong>{b.percent}% đã dùng</strong><span className="subtitle">Dự báo cả kỳ: {b.projected === null ? "Chưa đến kỳ" : formatVnd(b.projected)}</span>
          </div>
          {b.thresholds.length > 0 && !b.archived && <p className={`module-alert ${exceeded ? "module-danger-text" : ""}`}><AlertTriangle size={17} />{exceeded ? "Đã vượt 100% hạn mức" : `Đã chạm ngưỡng ${percent >= 100 ? "100" : percent >= 80 ? "80" : "50"}%`}</p>}
          <div className="finance-actions" style={{ marginTop: 18 }}><ActionMenu label={`Thao tác ngân sách ${b.name}`} disabled={busy} items={[
            { label: "Sửa ngân sách", icon: Pencil, onSelect: () => beginEdit(b) },
            { label: b.archived ? "Khôi phục" : "Lưu trữ", icon: b.archived ? RotateCcw : Archive, danger: !b.archived, onSelect: () => toggleArchive(b) },
          ]} /></div>
        </article>;
      })}
    </div>
  </>;
}
