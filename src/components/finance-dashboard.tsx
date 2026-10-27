"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CircleDollarSign, PiggyBank, Plus, WalletCards, Eye, EyeOff, SlidersHorizontal, ChevronRight, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatVnd } from "@/lib/money";
import type { netWorth } from "@/server/net-worth";
import { CashflowBars, CategoryDonut, WalletBalanceBars } from "@/components/dashboard-charts";
import { QuickTransactionSheet } from "@/components/quick-transaction-sheet";
import { FinancialPrivacyContext } from "@/components/financial-privacy-context";
import { reportPeriodPreset, type ReportPeriodPreset } from "@/lib/report-period-presets";
import { IconButton } from "@/components/ui/interaction-controls";

type Wallet = { id: string; name: string; type: string; balance: string; archived: boolean; includeInAvailable: boolean };
type Category = { id: string; name: string; color: string; amount: string };
type Row = { id: string; kind: string; amount: string; categoryName?: string; walletName: string; occurredAt: string; note: string | null };
type Report = {
  period: { start: string; endExclusive: string };
  filters: { walletId: string | null; categoryId: string | null };
  kpis: { income: string; expense: string; surplus: string; available: string; savingsRate: string | null; averageDailyExpense: string;
    netWorth: string; budgetUsage: { budgetId: string; name: string; scope: string; used: string; limit: string; percent: string } | null };
  comparison: { mode: "equal_calendar_days"; start: string; endExclusive: string; averageDayBasis: { current: number; previous: number };
    previous: { income: string; expense: string; surplus: string; available: string; savingsRate: string | null; averageDailyExpense: string; netWorth: string };
    changes: { income: { change: string | null; percent: string | null }; expense: { change: string | null; percent: string | null };
      surplus: { change: string | null; percent: string | null }; available: { change: string | null; percent: string | null };
      savingsRate: { change: string | null; percent: string | null }; averageDailyExpense: { change: string | null; percent: string | null };
      netWorth: { change: string | null; percent: string | null }; budgetUsage: null } };
  wallets: Wallet[];
  series: { date: string; income: string; expense: string; surplus: string }[];
  categories: Category[];
  recentTransactions: Row[];
  topExpenses: { id: string; amount: string; note: string | null; occurredAt: string; categoryId: string | null }[];
};

const formatDate = (date: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
const formatOccurred = (date: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(date));
const chartMoney = (v: number) => `${new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(v)} ₫`;
const chartTooltip = (value: number | string | readonly (number | string)[] | undefined) => formatVnd(String(Array.isArray(value) ? (value[0] ?? 0) : (value ?? 0)));

export function FinanceDashboard({ report, allWallets, allCategories, worth, detailed = false }: { report: Report; allWallets: { id: string; name: string }[]; allCategories: { id: string; name: string; parentId: string | null; color: string; kind: string; archived: boolean }[]; worth: Awaited<ReturnType<typeof netWorth>>; detailed?: boolean }) {
  const router = useRouter();
  const [start, setStart] = useState(report.period.start);
  const [end, setEnd] = useState(report.period.endExclusive);
  const [wallet, setWallet] = useState(report.filters.walletId ?? "");
  const [category, setCategory] = useState(report.filters.categoryId ?? "");
  const privacy = useContext(FinancialPrivacyContext);
  const [localShowBalance, setLocalShowBalance] = useState(true);
  const showBalance = privacy?.showBalance ?? localShowBalance;
  const setShowBalance = privacy?.setShowBalance ?? setLocalShowBalance;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterDialogRef = useRef<HTMLFormElement>(null);
  const filterCloseRef = useRef<HTMLButtonElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickKind, setQuickKind] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");
  const periodQuery = new URLSearchParams({ start: report.period.start, endExclusive: report.period.endExclusive });
  if (report.filters.walletId) periodQuery.set("walletId", report.filters.walletId);
  if (report.filters.categoryId) periodQuery.set("categoryId", report.filters.categoryId);
  const transactionUrl = (kind?: string, categoryId?: string) => {
    const p = new URLSearchParams(periodQuery);
    if (kind) p.set("kind", kind);
    if (categoryId) p.set("categoryId", categoryId);
    return `/transactions?${p.toString()}`;
  };
  const transactionDetailUrl = (transactionId: string) => {
    const p = new URLSearchParams(periodQuery);
    p.set("transactionId", transactionId);
    return `/transactions?${p.toString()}`;
  };
  const chartData = report.series.map(x => ({ day: formatDate(x.date), income: Number(x.income), expense: Number(x.expense), surplus: Number(x.surplus) }));
  // Rows exist only when the ledger has income/expense postings, including
  // offsetting entries whose net daily amount is zero (for example refunds).
  const hasMovement = report.series.length > 0;
  const hasActivityCards = report.recentTransactions.length > 0 || report.topExpenses.length > 0;
  function openQuick(kind: "INCOME" | "EXPENSE" | "TRANSFER") { setQuickKind(kind); setQuickOpen(true); }
  function focusFilters() {
    if (window.matchMedia("(max-width: 767px)").matches) setFiltersOpen(true);
    else document.getElementById("report-from")?.focus();
  }
  const cards = [
    { title: "Tổng thu nhập", amount: report.kpis.income, note: "Thu nhập thực nhận trong kỳ", icon: ArrowDownLeft, kind: "INCOME", key: "income" as const },
    { title: "Tổng chi tiêu", amount: report.kpis.expense, note: "Chi phí ròng sau hoàn tiền", icon: ArrowUpRight, kind: "EXPENSE", key: "expense" as const },
    { title: "Thu – chi ròng", amount: report.kpis.surplus, note: "Thu nhập trừ chi phí", icon: PiggyBank, kind: "", key: "surplus" as const },
    { title: "Số dư khả dụng", amount: report.kpis.available, note: "Số dư đến hết ngày thực tế cuối cùng trong kỳ", icon: WalletCards, kind: "", key: "available" as const },
  ];

  useEffect(() => {
    if (!filtersOpen) return;
    const originalOverflow = document.body.style.overflow;
    const trigger = filterTriggerRef.current;
    document.body.style.overflow = "hidden";
    filterCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setFiltersOpen(false); return; }
      if (event.key !== "Tab") return;
      const controls = filterDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (!filterDialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      trigger?.focus();
    };
  }, [filtersOpen]);

  const presets: { id: ReportPeriodPreset; label: string }[] = [
    { id: "thisMonth", label: "Tháng này" },
    { id: "lastMonth", label: "Tháng trước" },
    { id: "threeMonths", label: "3 tháng" },
    { id: "thisYear", label: "Năm nay" },
  ];

  function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams({ start, endExclusive: end });
    if (wallet) params.set("walletId", wallet);
    if (category) params.set("categoryId", category);
    setFiltersOpen(false);
    router.push(`${detailed ? "/reports" : "/dashboard"}?${params}`);
  }

  return <>
    <div className="page-head"><div><h1 className="page-title">{detailed ? "Báo cáo & phân tích" : "Tổng quan tài chính"}</h1><p className="subtitle">{detailed ? "Phân tích thu chi và biến động tài chính từ sổ cái của bạn." : "Rõ từng khoản thu chi, chủ động với kế hoạch tài chính."}</p></div></div>
    <section className="dashboard-hero" aria-labelledby="available-title"><div className="hero-top"><span id="available-title" className="hero-label">SỐ DƯ KHẢ DỤNG</span><IconButton className="button hero-hide" label={showBalance ? "Ẩn số tiền" : "Hiện số tiền"} icon={showBalance ? Eye : EyeOff} pressed={!showBalance} onClick={() => setShowBalance(value => !value)} /></div>
      <div className="hero-value" aria-live="polite">{showBalance ? formatVnd(report.kpis.available) : "••••••••"}</div><p className="hero-date">Số dư đến hết ngày thực tế cuối cùng trong kỳ · {formatDate(report.period.start)} – {formatDate(report.period.endExclusive)} (ngày kết thúc không thuộc kỳ)</p>
      <div className="hero-stats"><div className="hero-stat"><span><ArrowDownLeft size={16} /> Thu nhập trong kỳ</span><strong>{showBalance ? formatVnd(report.kpis.income) : "••••••"}</strong></div><div className="hero-stat"><span><ArrowUpRight size={16} /> Chi tiêu ròng trong kỳ</span><strong>{showBalance ? formatVnd(report.kpis.expense) : "••••••"}</strong></div></div>
      <div className="v4-dashboard-secondary-links"><button className="v4-hero-text-action" type="button" onClick={() => openQuick("INCOME")}><ArrowDownLeft size={17} /> Ghi thu</button><button className="v4-hero-text-action" type="button" onClick={() => openQuick("EXPENSE")}><ArrowUpRight size={17} /> Ghi chi</button><button className="v4-hero-text-action" type="button" onClick={() => openQuick("TRANSFER")}><ArrowLeftRight size={17} /> Chuyển ví</button><Link className="v4-hero-text-action" href="/settings#features">Tất cả tính năng <ChevronRight size={16} /></Link></div>
    </section>
    <div className="filter-toolbar"><span className="section-subtitle">Kỳ báo cáo: {formatDate(report.period.start)} – {formatDate(report.period.endExclusive)}</span><button ref={filterTriggerRef} type="button" className="filter-chip" aria-expanded={filtersOpen} aria-controls="dashboard-filters" onClick={() => setFiltersOpen(open => !open)}><SlidersHorizontal size={17} /> Bộ lọc</button></div>
    {filtersOpen && <button className="dashboard-filter-backdrop" type="button" aria-label="Đóng bộ lọc" tabIndex={-1} onClick={() => setFiltersOpen(false)} />}
    <form ref={filterDialogRef} id="dashboard-filters" role={filtersOpen ? "dialog" : undefined} aria-modal={filtersOpen ? "true" : undefined} aria-labelledby={filtersOpen ? "dashboard-filter-heading" : undefined} className={`card filterbar dashboard-filter-form ${filtersOpen ? "expanded-mobile" : "collapsed-mobile"}`} onSubmit={apply}>
      <div className="dashboard-filter-heading"><div className="sheet-handle" aria-hidden="true" /><div className="section-header"><h2 id="dashboard-filter-heading" className="section-title">Lọc báo cáo</h2><button ref={filterCloseRef} type="button" className="icon-button" aria-label="Đóng bộ lọc" onClick={() => setFiltersOpen(false)}><X size={20} /></button></div></div>
      <div className="dashboard-filter-presets" role="group" aria-label="Chọn nhanh kỳ báo cáo">{presets.map(preset => {
        const range = reportPeriodPreset(preset.id);
        return <button type="button" className="filter-chip" key={preset.id} aria-pressed={start === range.start && end === range.endExclusive} onClick={() => { setStart(range.start); setEnd(range.endExclusive); }}>{preset.label}</button>;
      })}</div>
      <div className="field"><label htmlFor="report-from">Từ ngày</label><input id="report-from" type="date" required value={start} onChange={e => setStart(e.target.value)} /></div>
      <div className="field"><label htmlFor="report-to">Đến trước ngày</label><input id="report-to" type="date" required value={end} min={start} onChange={e => setEnd(e.target.value)} /></div>
      <div className="field"><label htmlFor="report-wallet">Ví</label><select id="report-wallet" value={wallet} onChange={e => setWallet(e.target.value)}><option value="">Tất cả ví</option>{allWallets.map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select></div>
      <div className="field"><label htmlFor="report-category">Danh mục</label><select id="report-category" value={category} onChange={e => setCategory(e.target.value)}><option value="">Tất cả danh mục</option>{allCategories.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <button type="submit" className="button button-soft">Xem báo cáo</button>
    </form>
    {!allWallets.length && <div className="card card-pad" style={{ marginBottom: 20 }}><strong>Chào mừng đến với Finova!</strong><p className="subtitle">Bạn chưa có ví. Hãy tạo ví đầu tiên, nhập số dư thực tế và ghi giao dịch để bắt đầu phân tích.</p><Link href="/wallets" className="button button-primary" style={{ marginTop: 14 }}><Plus /> Tạo ví đầu tiên</Link></div>}
    <p className="section-subtitle" style={{ marginBottom: 12 }}>So sánh với kỳ liền trước cùng số ngày lịch: {report.comparison.start} đến trước {report.comparison.endExclusive}. Tỷ lệ thay đổi không xác định khi kỳ trước bằng 0.</p>
    <section className="kpi-grid" aria-label="Các chỉ số tài chính">{cards.map(({ title, amount, note, icon: Icon, kind, key }) => <Link className={`card kpi ${key === "available" ? "dashboard-available-kpi" : ""}`} key={title} href={transactionUrl(kind || undefined)} aria-label={`${title}: ${showBalance ? formatVnd(amount) : "đang ẩn"}; xem giao dịch`}><div className="kpi-head"><span>{title}</span><span className={`kpi-icon kpi-icon-${key}`}><Icon /></span></div><div className="kpi-value">{showBalance ? formatVnd(amount) : "••••••"}</div><div className="kpi-note">{note}</div><div className="kpi-note">So với kỳ trước: {showBalance ? (report.comparison.changes[key].change === null ? "N/A" : formatVnd(report.comparison.changes[key].change)) : "••••"}{showBalance ? (report.comparison.changes[key].percent === null ? " · N/A (%)" : ` · ${report.comparison.changes[key].percent}%`) : ""}</div></Link>)}</section>
    {!showBalance && <section className="card card-pad dashboard-private-state" role="status"><EyeOff size={24} aria-hidden="true" /><div><strong>Đã ẩn thông tin tài chính</strong><p className="subtitle">Chọn biểu tượng con mắt ở thẻ số dư để xem lại số liệu, biểu đồ và giao dịch.</p></div></section>}
    <div className="dashboard-private-content" hidden={!showBalance}>
    <section className="card card-pad" style={{ marginBottom: 22 }} aria-label="Giá trị tài sản ròng">
      <div className="section-header"><div><h2 className="section-title">Giá trị tài sản ròng</h2><p className="section-subtitle">Toàn bộ workspace tại ngày {worth.current.date} · tài sản + phải thu − nợ phải trả (không chịu bộ lọc thu chi)</p></div><strong style={{ color: "var(--finova-primary)", fontSize: 22 }}>{formatVnd(worth.current.netWorth)}</strong></div>
      <div className="finance-metrics"><div><span className="subtitle">Tài sản</span><strong>{formatVnd(worth.current.assets)}</strong></div><div><span className="subtitle">Phải thu</span><strong>{formatVnd(worth.current.receivables)}</strong></div><div><span className="subtitle">Nợ phải trả</span><strong>{formatVnd(worth.current.liabilities)}</strong></div><div><span className="subtitle">Biến động so với {worth.comparison.date}</span><strong>{formatVnd(worth.change)}</strong></div></div>
      <div className="finance-actions"><Link className="button button-soft" href="/debts">Xem vay nợ</Link><Link className="button button-soft" href="/cards">Xem thẻ tín dụng</Link><Link className="button button-outline" href="/goals">Mục tiêu tiết kiệm</Link></div>
    </section>
    <section className="card card-pad" style={{ marginBottom: 22 }} aria-label="Ngân sách sử dụng">
      <div className="section-header"><div><h2 className="section-title">Ngân sách sử dụng</h2><p className="section-subtitle">Chi phí ròng trên hạn mức ngân sách trong đúng kỳ đang xem.</p></div><Link className="text-link" href="/budgets">Xem ngân sách →</Link></div>
      {report.kpis.budgetUsage ? <div className="finance-metrics"><div><span className="subtitle">{report.kpis.budgetUsage.name}</span><strong>{report.kpis.budgetUsage.percent}%</strong></div><div><span className="subtitle">Đã sử dụng</span><strong>{formatVnd(report.kpis.budgetUsage.used)}</strong></div><div><span className="subtitle">Hạn mức</span><strong>{formatVnd(report.kpis.budgetUsage.limit)}</strong></div></div>
        : <p className="subtitle">{report.filters.walletId || report.filters.categoryId ? "Chỉ số ngân sách áp dụng cho toàn workspace; bỏ bộ lọc ví/danh mục để xem." : "Chưa có một ngân sách phù hợp duy nhất với kỳ báo cáo (ngân sách tổng được ưu tiên để tránh cộng trùng)."}</p>}
    </section>
    {hasMovement ? <div className="grid-main">
      <CashflowBars series={report.series} transactionUrl={transactionUrl()} />
      <CategoryDonut categories={report.categories} tree={allCategories} transactionUrl={(id, scope) => {
        // When the report is filtered to one direct category, keep that exact scope in drill-through.
        const p = new URLSearchParams(periodQuery);
        if (id === "ledger:transfer-fee") {
          p.set("kind", "TRANSFER");
          p.set("feeOnly", "true");
        } else {
          p.set("kind", "EXPENSE");
          p.set("categoryId", report.filters.categoryId ?? id);
          if (!report.filters.categoryId && scope === "subtree") p.set("categoryScope", "subtree");
          p.set("includeRefunds", "true");
        }
        return `/transactions?${p.toString()}`;
      }} />
    </div> : allWallets.length > 0 && <section className="card card-pad dashboard-empty"><h2 className="section-title">Không có thu chi trong khoảng thời gian đã chọn</h2><p className="subtitle">Bạn có thể chọn kỳ khác, thêm giao dịch thực tế hoặc nhập sao kê để xem xu hướng dòng tiền.</p><div className="dashboard-empty-actions"><button type="button" className="button button-primary" onClick={focusFilters}><SlidersHorizontal size={17} aria-hidden="true" /> Đổi khoảng thời gian</button><button type="button" className="v4-admin-record-link" onClick={() => openQuick("EXPENSE")}><Plus size={17} aria-hidden="true" /> Thêm giao dịch</button><Link className="v4-admin-record-link" href="/imports">Nhập sao kê <ChevronRight size={16} aria-hidden="true" /></Link></div></section>}
    {hasMovement && <div className="grid-half">
      <section className="card card-pad"><div className="section-header"><div><h2 className="section-title">Thu – chi ròng theo ngày</h2><p className="section-subtitle">Số dương là thặng dư, số âm là thâm hụt</p></div></div>{chartData.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}><defs><linearGradient id="surplusFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--finova-primary)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--finova-primary)" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--finova-chart-grid)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--finova-text-muted)" }} /><YAxis tickFormatter={chartMoney} width={80} tick={{ fontSize: 11, fill: "var(--finova-text-muted)" }} /><Tooltip formatter={chartTooltip} contentStyle={{ background: "var(--finova-surface-raised)", border: "1px solid var(--finova-border)", borderRadius: 12, color: "var(--finova-text)" }} /><Area name="Thu – chi ròng" type="monotone" dataKey="surplus" stroke="var(--finova-primary)" strokeWidth={2.5} fill="url(#surplusFill)" /></AreaChart></ResponsiveContainer></div> : <EmptyChart />}</section>
      <div><WalletBalanceBars wallets={report.wallets} transactionUrl={transactionUrl()} />
        <div className="card" style={{ marginTop: 25, padding: 17, background: "var(--finova-surface-subtle)" }}><div className="section-subtitle">Tỷ lệ tiết kiệm</div><strong style={{ fontSize: 22, color: "var(--finova-text)" }}>{report.kpis.savingsRate === null ? "—" : `${report.kpis.savingsRate}%`}</strong><p className="section-subtitle">{report.kpis.savingsRate === null ? "Chưa có thu nhập để tính tỷ lệ." : "(Thu nhập − chi phí) / thu nhập"}</p><div className="section-subtitle">Chênh lệch kỳ trước: {report.comparison.changes.savingsRate.change === null ? "N/A" : `${report.comparison.changes.savingsRate.change} điểm %`}</div><div className="section-subtitle" style={{ marginTop: 14 }}>Chi tiêu trung bình mỗi ngày: <strong>{formatVnd(report.kpis.averageDailyExpense)}</strong></div><div className="section-subtitle">Chênh lệch kỳ trước: {formatVnd(report.comparison.changes.averageDailyExpense.change ?? "0")}</div><p className="section-subtitle">Số ngày tính trung bình: kỳ này {report.comparison.averageDayBasis.current}, kỳ trước {report.comparison.averageDayBasis.previous}. Với kỳ đang diễn ra, phép so sánh trung bình chỉ mang tính tham khảo.</p></div>
      </div>
    </div>}
    {hasActivityCards && <div className="grid-half dashboard-activity-grid">
      {report.recentTransactions.length > 0 && <section className="card"><div className="card-pad section-header"><div><h2 className="section-title">Giao dịch gần đây</h2><p className="section-subtitle">Trong khoảng thời gian đã chọn</p></div><Link href={transactionUrl()} className="text-link">Xem tất cả →</Link></div><>
        <div className="table-wrap dashboard-desktop-table"><table><thead><tr><th>NỘI DUNG</th><th>NGÀY</th><th>SỐ TIỀN</th></tr></thead><tbody>{report.recentTransactions.map(t => <tr key={t.id}><td><Link href={transactionDetailUrl(t.id)} className="text-link"><strong>{t.categoryName || (t.kind === "TRANSFER" ? "Chuyển ví" : "Hoàn tiền")}</strong><div className="section-subtitle">{t.note || t.walletName}</div></Link></td><td>{formatOccurred(t.occurredAt)}</td><td className={t.kind === "EXPENSE" ? "amount-expense" : "amount-income"}>{formatVnd(t.amount)}</td></tr>)}</tbody></table></div>
        <div className="dashboard-mobile-transactions">{report.recentTransactions.map(t => <Link href={transactionDetailUrl(t.id)} key={t.id} className="dashboard-mobile-transaction">
          <div><strong>{t.categoryName || (t.kind === "TRANSFER" ? "Chuyển ví" : "Hoàn tiền")}</strong><span>{t.note || t.walletName}</span><time>{formatOccurred(t.occurredAt)}</time></div>
          <strong className={t.kind === "EXPENSE" ? "amount-expense" : "amount-income"}>{formatVnd(t.amount)}</strong>
        </Link>)}</div>
      </></section>}
      {report.topExpenses.length > 0 && <section className="card"><div className="card-pad section-header"><div><h2 className="section-title">Các khoản chi lớn</h2><p className="section-subtitle">5 khoản chi gốc lớn nhất trong kỳ, trước hoàn tiền</p></div></div><>
        <div className="table-wrap dashboard-desktop-table"><table><thead><tr><th>NỘI DUNG</th><th>NGÀY</th><th>SỐ TIỀN</th></tr></thead><tbody>{report.topExpenses.map(t => <tr key={t.id}><td><Link href={transactionDetailUrl(t.id)} className="text-link">{t.note || "Khoản chi"}</Link></td><td>{formatOccurred(t.occurredAt)}</td><td className="amount-expense">{formatVnd(t.amount)}</td></tr>)}</tbody></table></div>
        <div className="dashboard-mobile-transactions">{report.topExpenses.map(t => <Link href={transactionDetailUrl(t.id)} key={t.id} className="dashboard-mobile-transaction">
          <div><strong>{t.note || "Khoản chi"}</strong><time>{formatOccurred(t.occurredAt)}</time></div><strong className="amount-expense">{formatVnd(t.amount)}</strong>
        </Link>)}</div>
      </></section>}
    </div>}
    {detailed && <p className="subtitle" style={{ fontSize: 12, marginTop: 6 }}><CircleDollarSign size={14} style={{ verticalAlign: "middle" }} /> Các số tiền được tính từ sổ cái PostgreSQL. Thu chi không bao gồm chuyển tiền giữa ví và số dư mở đầu. <ArrowLeftRight size={13} style={{ verticalAlign: "middle" }} /> Ngày kết thúc là ngày đầu tiên không thuộc kỳ báo cáo.</p>}
    </div>
    <QuickTransactionSheet open={quickOpen} initialKind={quickKind} onClose={() => setQuickOpen(false)} />
  </>;
}

function EmptyChart() { return <div className="empty"><ArrowLeftRight /><strong>Chưa có số liệu</strong><p>Biểu đồ sẽ hiển thị khi có giao dịch thực tế trong kỳ.</p></div>; }
