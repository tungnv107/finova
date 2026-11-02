"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesCombined, ChevronDown, CircleHelp, FileUp, Lightbulb, ListChecks, LoaderCircle, Minus, ScanLine, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BudgetSuggestions } from "@/components/budget-suggestions";
import { SegmentedControl } from "@/components/ui/interaction-controls";
import { Decimal, formatVnd } from "@/lib/money";
import type { getFinancialIntelligence, explainFinancialIntelligence } from "@/server/ai/insights";
import styles from "./insights.module.css";

type Data = Awaited<ReturnType<typeof getFinancialIntelligence>>;
const compactVnd = (value: number) => new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const dateLabel = (day: string) => day.split("-").reverse().join("/");
const monthLabel = (month: string) => `${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;

export function FinancialInsights({ initial }: { initial: Data }) {
  const [narrative, setNarrative] = useState<Awaited<ReturnType<typeof explainFinancialIntelligence>>["narrative"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chartView, setChartView] = useState<"chart" | "table">("chart");
  const [showAll, setShowAll] = useState(false);
  const delta = new Decimal(initial.comparison.delta);
  const surplus = new Decimal(initial.totals.surplus);
  const drivers = [...initial.drivers].sort((a, b) => new Decimal(b.delta).abs().comparedTo(new Decimal(a.delta).abs()));
  const maxChange = Decimal.max(1, ...drivers.map(c => new Decimal(c.delta).abs()));
  const chartData = initial.months.map(m => ({ ...m, label: monthLabel(m.month), incomeValue: Number(m.income), expenseValue: Number(m.expense) }));
  const visibleDrivers = showAll ? drivers : drivers.slice(0, 6);

  async function explain() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/ai/insights", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Chưa phân tích được. Vui lòng thử lại.");
      setNarrative(result.data.narrative);
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }

  return <div className={styles.page}>
    <header className={styles.pageHead}>
      <div><span className={styles.eyebrow}><Sparkles size={14} /> FINOVA INSIGHTS</span><h1>Hiểu dòng tiền của bạn</h1><p>Nhìn rõ hôm nay. Chủ động cho tháng tới.</p></div>
      <div className={styles.headerActions}><span className={styles.period}><CalendarDays size={16} />Tháng {monthLabel(initial.period.start)}</span><Link href="/imports" className="button button-outline"><FileUp size={16} />Nhập sao kê</Link></div>
    </header>

    <section className={styles.metrics} aria-label="Tổng quan thu chi tháng này">
      <div className={styles.metric}><div className={styles.metricHead}><span>Thu nhập tháng này</span><span className={`${styles.metricIcon} ${styles.income}`}><ArrowDownLeft size={18} /></span></div><strong>{formatVnd(initial.totals.income)}</strong><p>Ghi nhận đến {dateLabel(initial.period.today)}</p></div>
      <div className={styles.metric}><div className={styles.metricHead}><span>Chi tiêu tháng này</span><span className={`${styles.metricIcon} ${styles.expense}`}><ArrowUpRight size={18} /></span></div><strong>{formatVnd(initial.totals.expense)}</strong><p>Chi tiêu ròng sau hoàn tiền</p></div>
      <div className={`${styles.metric} ${styles.balanceMetric}`}><div className={styles.metricHead}><span>Chênh lệch thu chi</span><span className={styles.metricIcon}><Wallet size={18} /></span></div><strong className={surplus.lt(0) ? styles.negative : surplus.gt(0) ? styles.positive : ""}>{formatVnd(initial.totals.surplus)}</strong><p>{!initial.hasData ? "Chưa ghi nhận thu chi" : surplus.lt(0) ? "Chi tiêu đang cao hơn thu nhập" : surplus.gt(0) ? "Thu nhập đang cao hơn chi tiêu" : "Thu nhập và chi tiêu bằng nhau"}</p></div>
      <div className={styles.metric}><div className={styles.metricHead}><span>Dự báo chi cuối tháng</span><span className={`${styles.metricIcon} ${styles.forecast}`}><ChartNoAxesCombined size={18} /></span></div><strong>{formatVnd(initial.totals.projectedExpense)}</strong><p><span className={styles.estimateDot} />{initial.period.elapsedDays < 7 ? "Dữ liệu đầu tháng còn ít" : `Ước tính từ ${initial.period.elapsedDays} ngày đã qua`}</p></div>
    </section>

    {!initial.hasData && <div className={styles.welcome}><span className={styles.welcomeIcon}><ChartNoAxesCombined size={28} /></span><div><h2>Bức tranh tài chính bắt đầu từ giao dịch đầu tiên</h2><p>Ghi thu chi hoặc nhập sao kê để xem xu hướng, biến động và gợi ý dành cho bạn.</p></div><Link href="/transactions" className="button button-primary">Ghi giao dịch<ArrowRight size={16} /></Link></div>}

    <div className={styles.overviewGrid}>
      <section className={styles.panel} aria-labelledby="cashflow-trend-heading">
        <div className={styles.panelHead}><div><h2 id="cashflow-trend-heading">Nhịp thu chi qua các tháng</h2><p>Xu hướng 4 tháng gần nhất · VND</p></div><SegmentedControl label="Cách xem xu hướng" value={chartView} onChange={setChartView} options={[{ value: "chart", label: "Biểu đồ" }, { value: "table", label: "Bảng số liệu" }]} className={styles.chartToggle} /></div>
        {chartView === "chart" ? <>
          <div className={styles.chartLegend}><span><i className={styles.incomeDot} />Thu nhập</span><span><i className={styles.expenseDot} />Chi tiêu ròng</span></div>
          <div className={styles.chart} role="region" aria-label="Biểu đồ thu nhập và chi tiêu ròng bốn tháng. Chuyển sang Bảng số liệu để đọc số tiền chính xác.">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 8, left: -15, bottom: 2 }} accessibilityLayer>
              <CartesianGrid stroke="var(--finova-chart-grid)" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={12} tick={{ fill: "var(--finova-text-muted)", fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={compactVnd} tick={{ fill: "var(--finova-text-muted)", fontSize: 10 }} width={64} />
              <Tooltip cursor={{ fill: "var(--finova-surface-subtle)", opacity: .5 }} contentStyle={{ background: "var(--finova-surface-raised)", border: "1px solid var(--finova-border)", borderRadius: 10, fontSize: 12, color: "var(--finova-text)" }} labelFormatter={label => `Tháng ${label}`} formatter={(value, _name, item) => formatVnd(String(item.payload?.[item.dataKey === "incomeValue" ? "income" : "expense"] ?? value))} />
              <Bar name="Thu nhập" dataKey="incomeValue" fill="var(--finova-teal-text)" radius={[5, 5, 0, 0]} maxBarSize={26} isAnimationActive={false} />
              <Bar name="Chi tiêu ròng" dataKey="expenseValue" fill="var(--finova-primary)" radius={[5, 5, 0, 0]} maxBarSize={26} isAnimationActive={false} />
            </BarChart></ResponsiveContainer>
          </div>
        </> : <div className={`table-wrap ${styles.trendTable}`} tabIndex={0} role="region" aria-label="Bảng thu chi bốn tháng"><table><thead><tr><th scope="col">Tháng</th><th scope="col">Thu nhập</th><th scope="col">Chi tiêu</th><th scope="col">Chênh lệch</th></tr></thead><tbody>{initial.months.map(m => <tr key={m.month}><th scope="row">{monthLabel(m.month)}{m.month === initial.period.start.slice(0, 7) && <small>Đến {dateLabel(initial.period.today).slice(0, 5)}</small>}</th><td>{formatVnd(m.income)}</td><td>{formatVnd(m.expense)}</td><td className={new Decimal(m.surplus).lt(0) ? styles.negative : new Decimal(m.surplus).gt(0) ? styles.positive : styles.muted}>{formatVnd(m.surplus)}</td></tr>)}</tbody></table></div>}
        <p className={styles.chartNote}><CircleHelp size={14} /><span>Tháng {Number(initial.period.start.slice(5, 7))} mới ghi nhận {initial.period.elapsedDays}/{initial.period.daysInMonth} ngày. Tháng trống có thể chưa được nhập dữ liệu.</span></p>
      </section>

      <aside className={styles.aiPanel} aria-labelledby="ai-analysis-heading">
        <div className={styles.aiTop}><span className={styles.aiIcon}><Sparkles size={23} /></span><span>GÓC NHÌN TỪ AI</span></div>
        <h2 id="ai-analysis-heading">Từ số liệu đến<br />bước tiếp theo.</h2><p className={styles.aiDescription}>Hiểu những thay đổi trong chi tiêu và tìm cách điều chỉnh kế hoạch của bạn.</p>
        <div className={styles.aiCapabilities}><span><ScanLine size={15} />Tóm tắt dòng tiền</span><span><Lightbulb size={15} />Gợi ý hành động</span></div>
        <div className={styles.aiAction}>
          <p id="ai-data-disclosure" className={styles.disclosure}><ShieldCheck size={15} /><span>Khi bấm phân tích, số liệu tổng hợp theo danh mục được gửi tới nhà cung cấp AI do quản trị viên cấu hình. Không gửi tên tài khoản, số tài khoản hoặc nội dung từng giao dịch.</span></p>
          <button type="button" className="button button-primary" aria-describedby="ai-data-disclosure ai-analysis-availability" disabled={busy || !initial.aiAvailable || !initial.hasData} onClick={explain}>{busy ? <LoaderCircle size={17} className={styles.spin} /> : <Sparkles size={17} />}{busy ? "Đang phân tích…" : narrative ? "Phân tích lại" : "Phân tích bằng AI"}{!busy && <ArrowRight size={16} />}</button>
          <p id="ai-analysis-availability" className={styles.availability}>{!initial.aiAvailable ? "Dịch vụ AI chưa được cấu hình. Số liệu và dự báo vẫn hoạt động." : !initial.hasData ? "Thêm giao dịch để bắt đầu phân tích." : "Bạn chủ động yêu cầu phân tích khi cần."}</p>
          <div aria-live="polite" className={styles.srOnly}>{busy ? "Đang phân tích số liệu." : narrative ? "Đã có nhận xét AI bên dưới." : ""}</div>
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
      </aside>
    </div>

    {narrative && <section className={`${styles.panel} ${styles.narrative}`} aria-labelledby="ai-results-heading" aria-busy={busy}>
      <div className={styles.resultHeading}><span className={styles.aiIcon}><Sparkles size={21} /></span><div><span className={styles.resultEyebrow}>DỰA TRÊN DỮ LIỆU CỦA BẠN</span><h2 id="ai-results-heading">Nhận xét từ AI</h2></div></div>
      <p className={styles.narrativeSummary}>{narrative.summary}</p><div className={styles.resultGrid}><div><h3><ScanLine size={17} />Điểm đáng chú ý</h3><ul>{narrative.observations.map((text, i) => <li key={i}>{text}</li>)}</ul></div><div><h3><ListChecks size={17} />Gợi ý hành động</h3><ol>{narrative.recommendations.map((text, i) => <li key={i}>{text}</li>)}</ol></div></div>
    </section>}

    <section className={`${styles.panel} ${styles.drivers}`} aria-labelledby="spending-changes-heading">
      <div className={styles.panelHead}><div><h2 id="spending-changes-heading">Điều gì làm thay đổi chi tiêu?</h2><p>So sánh {initial.period.comparisonDays} ngày đầu tháng này và tháng trước.</p></div><span className={styles.categoryCount}>{drivers.length} danh mục</span></div>
      {initial.hasData && drivers.length > 0 ? <>
        <div className={styles.comparison}><span className={`${styles.changeIcon} ${delta.gt(0) ? styles.negative : delta.lt(0) ? styles.positive : styles.muted}`}>{delta.gt(0) ? <ArrowUpRight size={21} /> : delta.lt(0) ? <ArrowDownRight size={21} /> : <Minus size={21} />}</span><div><p>Chi tiêu {delta.gt(0) ? "tăng" : delta.lt(0) ? "giảm" : "không đổi"}{!delta.isZero() && <> <strong>{formatVnd(delta.abs().toFixed(0))}</strong></>}{initial.comparison.percent !== null && <span className={styles.changePercent}>{new Decimal(initial.comparison.percent).abs().toString().replace(".", ",")}%</span>}</p><span>{initial.comparison.percent === null ? "Chưa có mức chi kỳ trước để tính tỷ lệ thay đổi." : "Đối chiếu cùng số ngày để so sánh nhất quán."}</span></div></div>
        <div className={styles.driverColumnHead} aria-hidden="true"><span>Danh mục</span><span>Mức biến động</span><span>Kỳ trước</span><span>Kỳ này</span><span>Chênh lệch</span></div>
        <div id="spending-driver-list" className={styles.driverList}>{visibleDrivers.map((c, index) => {
          const change = new Decimal(c.delta);
          const tone = change.gt(0) ? styles.negative : change.lt(0) ? styles.positive : styles.muted;
          const width = change.abs().div(maxChange).mul(50).toNumber();
          return <article key={c.id ?? c.name} className={styles.driverRow}>
            <div className={styles.driverName}><span>{String(index + 1).padStart(2, "0")}</span><h3>{c.name}</h3></div>
            <div className={styles.changeTrack} aria-hidden="true"><div className={tone} style={{ left: `${change.lt(0) ? 50 - width : 50}%`, width: `${width}%` }} /></div>
            <div className={styles.driverAmount}><span>Kỳ trước</span>{formatVnd(c.previous)}</div><div className={`${styles.driverAmount} ${styles.currentAmount}`}><span>Kỳ này</span>{formatVnd(c.amount)}</div>
            <strong className={`${styles.driverDelta} ${tone}`}>{change.gt(0) ? <ArrowUpRight size={14} /> : change.lt(0) ? <ArrowDownRight size={14} /> : <Minus size={14} />}{change.gt(0) ? "+" : ""}{formatVnd(c.delta)}</strong>
          </article>;
        })}</div>
        {drivers.length > 6 && <button type="button" className={styles.showMore} aria-expanded={showAll} aria-controls="spending-driver-list" onClick={() => setShowAll(v => !v)}>{showAll ? "Thu gọn danh sách" : `Xem tất cả ${drivers.length} danh mục`}<ChevronDown size={16} className={showAll ? styles.rotated : ""} /></button>}
        <p className={styles.driverNote}>Xếp theo mức thay đổi lớn nhất. Số liệu phản ánh biến động theo danh mục, chưa đủ để kết luận nguyên nhân sinh hoạt.</p>
      </> : <div className={styles.emptyDrivers}><ScanLine size={27} /><h3>Chưa có chi tiêu để so sánh</h3><p>Các danh mục sẽ xuất hiện khi có giao dịch chi trong kỳ so sánh.</p><Link href="/transactions">Xem giao dịch<ArrowRight size={14} /></Link></div>}
    </section>

    <BudgetSuggestions initial={initial} />
  </div>;
}
