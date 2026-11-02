"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, PiggyBank, Pencil, Archive, RotateCcw, ArrowUpRight, CalendarDays, Check, Info, Layers3, PieChart, Wallet, X } from "lucide-react";
import { ActionMenu } from "@/components/ui/interaction-controls";
import { formatVnd } from "@/lib/money";
import type { listBudgetPerformance } from "@/server/budgets";
import styles from "./budgets.module.css";

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
  const [view, setView] = useState<"active" | "exceeded" | "archived">("active");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [open, editing]);

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
      setOpen(false); setEditing(null); setView("active"); router.refresh();
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
  const archivedCount = initialBudgets.length - active.length;
  const visible = initialBudgets.filter(b => view === "archived" ? b.archived : !b.archived && (view !== "exceeded" || Number(b.percent) > 100));

  return <div className={styles.manager}>
    <header className={styles.pageHead}><div><span className={styles.eyebrow}>KẾ HOẠCH CHI TIÊU</span><h1>Ngân sách</h1><p>Chi tiêu có kế hoạch. An tâm với từng hạn mức.</p></div>
      <button className="button button-primary" disabled={busy} onClick={beginCreate}><Plus size={18} aria-hidden="true" /> Tạo ngân sách</button></header>
    <section className={styles.stats} aria-label="Tổng quan ngân sách">
      <div className={`${styles.stat} ${styles.statActive}`}><div className={styles.statTop}><span>Đang sử dụng</span><span className={styles.statIcon}><Wallet size={19} /></span></div><strong>{active.length}<small>ngân sách</small></strong><p>Các hạn mức đang theo dõi</p></div>
      <div className={`${styles.stat} ${styles.statWarning}`}><div className={styles.statTop}><span>Vượt hạn mức</span><span className={styles.statIcon}><AlertTriangle size={19} /></span></div><strong>{exceededCount}<small>ngân sách</small></strong><p>{exceededCount ? "Cần xem lại kế hoạch chi tiêu" : "Chưa có ngân sách vượt hạn mức"}</p></div>
      <div className={styles.stat}><div className={styles.statTop}><span>Đã lưu trữ</span><span className={styles.statIcon}><Archive size={19} /></span></div><strong>{archivedCount}<small>ngân sách</small></strong><p>Có thể khôi phục bất cứ lúc nào</p></div>
    </section>

    {open && <form ref={formRef} className={styles.editor} onSubmit={save} aria-label={editing ? "Cập nhật ngân sách" : "Tạo ngân sách mới"}>
      <div className="section-header"><h2 className="section-title">{editing ? "Cập nhật ngân sách" : "Tạo ngân sách mới"}</h2>
        <button type="button" className={styles.closeButton} aria-label="Đóng biểu mẫu ngân sách" disabled={busy} onClick={() => { setOpen(false); setError(""); }}><X size={20} /></button></div>
      <fieldset className={styles.formFields} disabled={busy}><div className="form-grid" style={{ marginTop: 18 }}>
        <div className="field"><label htmlFor="budget-name">Tên ngân sách</label><input id="budget-name" required maxLength={100} value={form.name} placeholder="Ví dụ: Ăn uống tháng này" onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="field"><label htmlFor="budget-limit">Hạn mức (₫)</label><input id="budget-limit" required type="number" min="1" max="9999999999999999" step="1" value={form.limitAmount} onChange={e => setForm(f => ({ ...f, limitAmount: e.target.value }))} /></div>
        <div className="field"><label htmlFor="budget-period">Kỳ ngân sách</label><select id="budget-period" value={form.period} onChange={e => { const period = e.target.value as Period; setForm(f => ({ ...f, period, ...defaults(period) })); }}><option value="MONTHLY">Theo tháng</option><option value="WEEKLY">Theo tuần (thứ Hai – Chủ nhật)</option><option value="CUSTOM">Khoảng tùy chọn</option></select></div>
        <div className="field"><label htmlFor="budget-scope">Phạm vi</label><select id="budget-scope" value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as Scope, categoryIds: [] }))}><option value="TOTAL">Tổng chi tiêu</option><option value="CATEGORY">Một danh mục</option><option value="GROUP">Nhóm danh mục</option></select></div>
        <div className="field"><label htmlFor="budget-start">Từ ngày (bao gồm)</label><input id="budget-start" required type="date" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} /></div>
        <div className="field"><label htmlFor="budget-end">Đến trước ngày</label><input id="budget-end" required type="date" value={form.endExclusive} onChange={e => setForm(f => ({ ...f, endExclusive: e.target.value }))} /></div>
      </div>
      {form.period !== "CUSTOM" && <p className="subtitle" style={{ marginTop: 10 }}>Kỳ tháng bắt đầu ngày 01; kỳ tuần bắt đầu thứ Hai. Có thể đổi ngày để chọn tháng hoặc tuần khác.</p>}
      {form.scope !== "TOTAL" && <fieldset className={styles.categoryPicker}>
        <legend style={{ fontWeight: 700 }}>Danh mục chi tiêu {form.scope === "GROUP" ? "(chọn từ 2)" : "(chọn 1)"}</legend>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {categories.map(category => <label key={category.id} style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><input type={form.scope === "CATEGORY" ? "radio" : "checkbox"} name="budget-category" checked={form.categoryIds.includes(category.id)} onChange={e => setForm(f => ({ ...f, categoryIds: f.scope === "CATEGORY" ? [category.id] : e.target.checked ? [...f.categoryIds, category.id] : f.categoryIds.filter(id => id !== category.id) }))} />{category.name}</label>)}
          {!categories.length && <span>Chưa có danh mục chi. Tạo danh mục trước khi lập ngân sách.</span>}
        </div>
      </fieldset>}</fieldset>
      {error && <div className="form-error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
      <div className="form-footer"><button className="button button-primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu ngân sách"}</button></div>
    </form>}

    {!open && error && <div className="form-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
    <section aria-labelledby="my-budgets-heading">
      <div className={styles.sectionHead}><h2 id="my-budgets-heading">Ngân sách của bạn</h2>
        <div className={styles.filters} role="group" aria-label="Lọc ngân sách">
          {([{ value: "active", label: "Đang dùng", count: active.length }, { value: "exceeded", label: "Vượt hạn mức", count: exceededCount }, { value: "archived", label: "Lưu trữ", count: archivedCount }] as const).map(option => <button key={option.value} type="button" aria-pressed={view === option.value} onClick={() => setView(option.value)}>{option.label}<span>{option.count}</span></button>)}
        </div>
      </div>
      {!visible.length && (view === "active" ? <div className={styles.emptyState}>
        <div className={styles.emptyCopy}><span className={styles.emptyLabel}><span /> BẮT ĐẦU TỪ MỘT HẠN MỨC</span><h3>Dành chỗ cho những điều<br />quan trọng với bạn.</h3><p>Tạo ngân sách đầu tiên để biết đã chi bao nhiêu,<br className={styles.desktopBreak} /> còn lại bao nhiêu và khi nào cần điều chỉnh.</p><button type="button" className="button button-primary" disabled={busy} onClick={beginCreate}><Plus size={17} /> Tạo ngân sách đầu tiên</button></div>
        <div className={styles.emptyArt} aria-hidden="true"><div className={styles.artOrbit} /><div className={styles.artPig}><PiggyBank size={66} strokeWidth={1.4} /></div><span className={styles.artCheck}><Check size={20} /></span><span className={styles.artTrend}><ArrowUpRight size={22} /></span><div className={styles.artCard}><span>Một kế hoạch nhỏ</span><strong>Một bước an tâm</strong><div><i /><i /><i /><i /><i /></div></div></div>
      </div> : <div className={styles.filterEmpty}>{view === "archived" ? <Archive size={28} /> : <Check size={28} />}<h3>{view === "archived" ? "Chưa có ngân sách lưu trữ" : "Không có ngân sách vượt hạn mức"}</h3><p>{view === "archived" ? "Các ngân sách bạn lưu trữ sẽ xuất hiện tại đây." : "Xem các hạn mức đang dùng để tiếp tục theo dõi chi tiêu."}</p><button type="button" className="button button-outline" onClick={() => setView("active")}>Xem ngân sách đang dùng</button></div>)}
    <div className={styles.budgetGrid}>
      {visible.map(b => {
        const percent = Number(b.percent);
        const exceeded = percent > 100;
        const warning = percent >= 80;
        const Icon = b.scope === "TOTAL" ? Wallet : b.scope === "GROUP" ? Layers3 : PieChart;
        const dateLabel = (value: string) => value.split("-").reverse().join("/");
        return <article className={`${styles.budgetCard} ${b.archived ? styles.archivedCard : ""}`} key={b.id}>
          <div className={styles.cardHead}><span className={styles.budgetIcon}><Icon size={21} /></span>
            <div><h3>{b.name}</h3><p>{b.scope === "TOTAL" ? "Tổng chi tiêu" : b.categories.map(c => c.name).join(", ")}</p></div>
            <ActionMenu label={`Thao tác ngân sách ${b.name}`} disabled={busy} items={[
              { label: "Sửa ngân sách", icon: Pencil, onSelect: () => beginEdit(b) },
              { label: b.archived ? "Khôi phục" : "Lưu trữ", icon: b.archived ? RotateCcw : Archive, danger: !b.archived, onSelect: () => toggleArchive(b) },
            ]} />
          </div>
          <div className={styles.cardPeriod}><CalendarDays size={14} /><span>{dateLabel(b.start)} – {dateLabel(plusDays(b.endExclusive, -1))}</span><span className={styles.periodTag}>{b.period === "MONTHLY" ? "Tháng" : b.period === "WEEKLY" ? "Tuần" : "Tùy chọn"}</span></div>
          <div className={styles.cardAmount}><span>Đã sử dụng</span><strong>{formatVnd(b.used)}</strong><span>trên {formatVnd(b.limitAmount)}</span></div>
          <div className={`${styles.progress} ${exceeded ? styles.progressDanger : warning ? styles.progressWarning : ""}`} role="progressbar" aria-valuenow={Math.max(0, Math.min(100, percent))} aria-valuetext={`${b.percent}% đã dùng`} aria-valuemin={0} aria-valuemax={100} aria-label={`Tiến độ ngân sách ${b.name}`}><div style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} /></div>
          <div className={styles.cardBalance}><strong className={exceeded ? styles.dangerText : ""}>{exceeded ? "Vượt " : "Còn "}{formatVnd(exceeded ? b.remaining.replace("-", "") : b.remaining)}</strong><span>{b.percent}%</span></div>
          <div className={styles.cardFoot}><span className={`${styles.status} ${b.archived ? styles.neutral : exceeded ? styles.danger : warning ? styles.warning : styles.good}`}>{b.archived ? "Đã lưu trữ" : exceeded ? "Vượt hạn mức" : percent >= 100 ? "Đã dùng hết hạn mức" : warning ? "Gần chạm hạn mức" : "Trong hạn mức"}</span><span>Dự báo: <strong>{b.projected === null ? "Chưa đến kỳ" : formatVnd(b.projected)}</strong></span></div>
        </article>;
      })}
    </div>
      <p className={styles.footnote}><Info size={14} /> Hạn mức được theo dõi riêng, không cộng gộp. Chi tiêu đã trừ hoàn tiền và bút toán đảo.</p>
    </section>
  </div>;
}
