"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeftRight, Eye, EyeOff } from "lucide-react";
import { SegmentedControl, ExportMenu } from "@/components/ui/interaction-controls";
import { formatVnd } from "@/lib/money";
import { FinancialPrivacyContext } from "@/components/financial-privacy-context";
import type { overview } from "@/server/reporting";
import type { expenseHeatmap, historicalTrends } from "@/server/analytics";
import type { listBudgetPerformance } from "@/server/budgets";

type Report = Awaited<ReturnType<typeof overview>>;
type Heatmap = Awaited<ReturnType<typeof expenseHeatmap>>;
type Trends = Awaited<ReturnType<typeof historicalTrends>>;
type Budget = Awaited<ReturnType<typeof listBudgetPerformance>>[number];

const tabs = ["Thu – chi", "Dòng tiền / Số dư", "Ngân sách", "Danh mục", "Thời gian"] as const;
const nextDate = (day: string) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

export function ReportTabs({ report, heatmap, trends, budgets, children }: {
  report: Report; heatmap: Heatmap; trends: Trends; budgets: Budget[]; children: ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [showBalance, setShowBalance] = useState(true);
  const [months, setMonths] = useState<6 | 12>(6);
  const [start, setStart] = useState(report.period.start);
  const [endExclusive, setEndExclusive] = useState(report.period.endExclusive);
  const query = new URLSearchParams({ start: report.period.start, endExclusive: report.period.endExclusive });
  if (report.filters.walletId) query.set("walletId", report.filters.walletId);
  if (report.filters.categoryId) query.set("categoryId", report.filters.categoryId);
  const filteredTransactionLink = (categoryId?: string, date?: string) => {
    const params = new URLSearchParams(query);
    if (categoryId) params.set("categoryId", categoryId);
    if (date) { params.set("start", date); params.set("endExclusive", nextDate(date)); }
    return `/transactions?${params.toString()}`;
  };
  const moneyTooltip = (value: number | string | readonly (number | string)[] | undefined) =>
    formatVnd(String(Array.isArray(value) ? (value[0] ?? 0) : (value ?? 0)));
  const trendRows = trends.months.slice(-months).map(t => ({ ...t, income: Number(t.income), expense: Number(t.expense), surplus: Number(t.surplus) }));
  const maxHeat = Math.max(0, ...heatmap.days.map(x => Math.max(0, Number(x.expense))));
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
      : event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`report-tab-${next}`)?.focus();
  };

  return <FinancialPrivacyContext.Provider value={{ showBalance, setShowBalance }}>
    <div className="report-tabs-toolbar">
    <div role="tablist" aria-label="Các nhóm báo cáo" className="report-tabs-list v4-tablist">
      {tabs.map((label, index) => <button type="button" role="tab" id={`report-tab-${index}`} aria-controls="report-tab-panel" aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} key={label}
        onKeyDown={event => handleTabKeyDown(event, index)} onClick={() => setTab(index)}>{label}</button>)}
    </div>
    <button type="button" className="button button-outline report-privacy-toggle" aria-pressed={!showBalance} onClick={() => setShowBalance(value => !value)}>
      {showBalance ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      {showBalance ? "Ẩn số liệu" : "Hiện số liệu"}
    </button>
    </div>
    {!showBalance && <p className="report-privacy-hint" role="note">Chỉ ẩn số liệu trên màn hình. Tệp CSV, Excel và PDF xuất ra vẫn chứa dữ liệu tài chính đầy đủ.</p>}
    <div className="v4-report-toolbar"><span className="section-subtitle">Xuất dữ liệu theo kỳ và bộ lọc hiện tại</span><ExportMenu items={[
      { label: "Tải CSV", href: `/api/v1/exports/transactions.csv?${query.toString()}` },
      { label: "Tải Excel", href: `/api/v1/exports/reports.xlsx?${query.toString()}` },
      { label: "Tải PDF", href: `/api/v1/exports/reports.pdf?${query.toString()}` },
    ]} /></div>
    <div id="report-tab-panel" role="tabpanel" aria-labelledby={`report-tab-${tab}`} tabIndex={0}>
    {tab !== 0 && !showBalance && <section className="card card-pad dashboard-private-state" role="status">
      <EyeOff size={24} aria-hidden="true" /><div><strong>Đang ẩn thông tin tài chính</strong><p className="subtitle">Chọn “Hiện số liệu” để xem dữ liệu và biểu đồ trong báo cáo.</p></div>
    </section>}
    <div className="report-private-content" hidden={tab !== 0 && !showBalance}>
    {tab === 0 ? children : <>
      <div className="page-head"><div><h1 className="page-title">{tabs[tab]}</h1><p className="subtitle">Các số liệu lấy từ sổ cái trong workspace của bạn.</p></div></div>
      <form className="card filterbar" onSubmit={e => { e.preventDefault(); const next = new URLSearchParams(query); next.set("start", start); next.set("endExclusive", endExclusive); router.push(`/reports?${next.toString()}`); }}>
        <div className="field"><label htmlFor="report-tab-start">Từ ngày</label><input id="report-tab-start" type="date" required value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="field"><label htmlFor="report-tab-end">Đến trước ngày</label><input id="report-tab-end" type="date" required min={start} value={endExclusive} onChange={e => setEndExclusive(e.target.value)} /></div>
        <button type="submit" className="button button-soft">Áp dụng kỳ</button>
        <Link className="button button-outline" href={`/reports?${query.toString()}`}>Bộ lọc ví / danh mục</Link>
      </form>
    </>}
    {tab === 1 && <div className="grid-half">
      <section className="card card-pad"><h2 className="section-title">Thu nhập và chi phí trong kỳ</h2>
        <p className="subtitle">Thặng dư thu – chi là {formatVnd(report.kpis.surplus)}. Chuyển ví và số dư đầu kỳ không tính vào thu/chi.</p>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.series.map(row => ({ date: row.date.slice(5), income: Number(row.income), expense: Number(row.expense) }))}><CartesianGrid stroke="var(--finova-chart-grid)" strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis width={70} /><Tooltip contentStyle={{ background: "var(--finova-surface-raised)", border: "1px solid var(--finova-border)", borderRadius: 12, color: "var(--finova-text)" }} formatter={moneyTooltip} /><Legend /><Bar name="Thu nhập" dataKey="income" fill="var(--finova-income)" /><Bar name="Chi phí" dataKey="expense" fill="var(--finova-expense)" /></BarChart></ResponsiveContainer></div>
      </section>
      <section className="card card-pad"><h2 className="section-title">Số dư cuối kỳ theo ví</h2><div className="legend-list" style={{ marginTop: 15 }}>
        {report.wallets.map(w => <div key={w.id} className="legend-row"><span>{w.name}</span><strong>{formatVnd(w.balance)}</strong></div>)}
        {!report.wallets.length && <div className="empty">Chưa có ví.</div>}
      </div><p className="subtitle" style={{ marginTop: 14 }}>Số dư khả dụng: {formatVnd(report.kpis.available)}. Đây là số dư sổ cái đến cuối kỳ; không phải chỉ tiêu thặng dư.</p></section>
    </div>}
    {tab === 2 && <section className="card card-pad"><div className="section-header"><h2 className="section-title">Kế hoạch và thực tế</h2><Link href="/budgets" className="button button-primary">Quản lý ngân sách</Link></div>
      <p className="subtitle" style={{ margin: "10px 0 20px" }}>Mỗi ngân sách được tính riêng theo kỳ của chính nó. Ngân sách tổng có thể chứa khoản chi của ngân sách danh mục và không được cộng chung.</p>
      {budgets.length ? budgets.map(b => <div key={b.id} className="report-budget-record"><div className="legend-row"><span><strong>{b.name}</strong><br /><small>{b.start} → {b.endExclusive} · {b.categories.map(c => c.name).join(", ") || "Tổng chi"}</small></span><strong>{b.percent}%</strong></div>
        <div className="report-budget-track" role="progressbar" aria-label={`Đã sử dụng ngân sách ${b.name}`} aria-valuenow={Math.max(0, Math.min(100, Number(b.percent)))} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${b.percent}%`}><div className={Number(b.percent) > 100 ? "is-over-budget" : ""} style={{ width: `${Math.max(0, Math.min(100, Number(b.percent)))}%` }} /></div>
        <p className="subtitle">Đã dùng {formatVnd(b.used)} / {formatVnd(b.limitAmount)} · Còn lại {formatVnd(b.remaining)}</p></div>) : <div className="empty">Chưa lập ngân sách. <Link href="/budgets">Tạo ngân sách đầu tiên</Link></div>}
    </section>}
    {tab === 3 && <section className="card"><div className="card-pad"><h2 className="section-title">Chi phí ròng theo danh mục</h2><p className="subtitle">Các giá trị âm có thể phát sinh khi hoàn tiền vượt chi phí phát sinh trong chính kỳ.</p></div>
      {report.categories.length ? <div className="table-wrap"><table><thead><tr><th>DANH MỤC</th><th>CHI PHÍ RÒNG</th><th>GIAO DỊCH</th></tr></thead><tbody>{report.categories.map(c => <tr key={c.id}><td>{c.name}</td><td>{formatVnd(c.amount)}</td><td><Link className="text-link" href={filteredTransactionLink(c.id)}>Xem chi tiết →</Link></td></tr>)}</tbody></table></div> : <div className="empty">Chưa có khoản chi trong kỳ.</div>}
    </section>}
    {tab === 4 && <div style={{ display: "grid", gap: 20 }}>
      <section className="card card-pad"><div className="section-header"><div><h2 className="section-title">Xu hướng theo tháng</h2><p className="subtitle">Kết thúc ở tháng chứa ngày cuối cùng của kỳ đã chọn.</p></div><SegmentedControl label="Số tháng theo dõi" value={String(months)} options={[{ value: "6", label: "6 tháng" }, { value: "12", label: "12 tháng" }]} onChange={next => setMonths(next === "6" ? 6 : 12)} /></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendRows}><CartesianGrid stroke="var(--finova-chart-grid)" strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis width={70} /><Tooltip contentStyle={{ background: "var(--finova-surface-raised)", border: "1px solid var(--finova-border)", borderRadius: 12, color: "var(--finova-text)" }} formatter={moneyTooltip} /><Legend /><Bar name="Thu" dataKey="income" fill="var(--finova-income)" /><Bar name="Chi" dataKey="expense" fill="var(--finova-expense)" /></BarChart></ResponsiveContainer></div>
      </section>
      <section className="card card-pad"><h2 className="section-title">Lịch chi tiêu theo ngày</h2><p className="subtitle" style={{ marginBottom: 14 }}>Chọn một ngày để xem giao dịch. Màu đậm biểu thị chi phí ròng cao hơn trong khoảng đã chọn.</p>
        <div className="report-heatmap">
          {heatmap.days.map(day => { const value = Number(day.expense); const intensity = maxHeat ? Math.max(0, value) / maxHeat : 0;
            return <Link title={`${day.date}: ${formatVnd(day.expense)}`} aria-label={`${day.date}: ${formatVnd(day.expense)}`} href={filteredTransactionLink(undefined, day.date)} key={day.date}
              className="report-heatmap-day" data-intensity={intensity > .6 ? "high" : intensity > 0 ? "medium" : "none"}>
              {day.date.slice(-2)}</Link>; })}
        </div>
        {!heatmap.days.length && <div className="empty"><ArrowLeftRight /> Chưa có ngày nào trong khoảng.</div>}
      </section>
    </div>}
    </div>
    </div>
  </FinancialPrivacyContext.Provider>;
}
