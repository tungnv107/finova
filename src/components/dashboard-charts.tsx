"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftRight, WalletCards } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatVnd } from "@/lib/money";
import { cashFlowLabel, groupCashFlowSeries, type CashFlowGranularity, type CashFlowPoint } from "@/lib/dashboard-series";
import { categoryDonutView, type CategoryBranch, type DonutRow, type ExpenseSlice } from "@/lib/category-donut";

const compactVnd = (value: number) => `${new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value)} ₫`;
const fullVnd = (value: number | string | readonly (number | string)[] | undefined) =>
  formatVnd(String(Array.isArray(value) ? (value[0] ?? 0) : (value ?? 0)));

export function CategoryDonut({ categories, tree, transactionUrl }: {
  categories: ExpenseSlice[]; tree: CategoryBranch[]; transactionUrl: (categoryId: string, scope: "direct" | "subtree") => string;
}) {
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const view = categoryDonutView(categories, tree, selectedParent);
  const chart = view.visible.map(row => ({ ...row, value: Number(row.amount) }));

  function label(row: DonutRow) {
    if (row.canDrill) return <button type="button" className="text-link" onClick={() => setSelectedParent(row.id)} aria-label={`Xem danh mục con của ${row.name}`}>{row.name} →</button>;
    if (row.categoryId || row.id === "ledger:transfer-fee") return <Link className="text-link" href={transactionUrl(row.categoryId ?? row.id, "direct")}>{row.name}</Link>;
    return <span>{row.name}</span>;
  }
  function line(row: DonutRow) {
    return <div key={row.id} className="legend-row"><span className="legend-label"><span className="legend-dot" style={{ backgroundColor: row.color }} />{label(row)}</span><strong>{formatVnd(row.amount)}</strong></div>;
  }
  return <section className="card card-pad">
    <div className="section-header"><div><h2 className="section-title">Chi tiêu theo danh mục</h2>
      <p className="section-subtitle">Chi tiêu ròng · Top 5 và Khác · {view.selected?.name ?? "Tất cả danh mục"}</p></div>
      {view.selected && <button type="button" className="button button-outline" onClick={() => setSelectedParent(view.upId)}>← Quay lại</button>}
    </div>
    {view.pieEligible ? <>
      <div className="chart-wrap" style={{ height: 200 }} role="img" aria-label={`Biểu đồ tỷ trọng chi tiêu ${view.selected?.name ?? "theo danh mục gốc"}`}>
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chart} dataKey="value" nameKey="name" innerRadius={57} outerRadius={83} paddingAngle={2} stroke="none">
          {chart.map(c => <Cell key={c.id} fill={c.color} />)}
        </Pie><Tooltip contentStyle={{ background: "var(--finova-surface-raised)", border: "1px solid var(--finova-border)", borderRadius: 12, color: "var(--finova-text)" }} formatter={(value, _name, entry) => formatVnd(String(entry.payload?.amount ?? value))} /></PieChart></ResponsiveContainer>
      </div>
      <div className="legend-list" aria-label="Danh mục và số tiền ròng">
        {view.visible.map(row => row.group === "OTHER" ? <details key={row.id}><summary className="legend-row"><span className="legend-label"><span className="legend-dot" style={{ backgroundColor: row.color }} />Khác ({view.rows.length - 5} danh mục)</span><strong>{formatVnd(row.amount)}</strong></summary><div style={{ paddingLeft: 15 }}>{view.rows.slice(5).map(line)}</div></details> : line(row))}
      </div>
    </> : view.rows.length ? <div className="legend-list"><p className="subtitle">Có khoản chi ròng âm do hoàn tiền trong kỳ. Không hiển thị tỷ trọng để tránh sai lệch; số liệu bên dưới vẫn giữ nguyên dấu.</p>{view.rows.map(line)}</div>
      : <div className="empty"><ArrowLeftRight /><strong>Chưa có chi tiêu</strong><p>Thêm giao dịch để xem cơ cấu chi tiêu.</p></div>}
    {view.selected && <p className="subtitle" style={{ marginTop: 12 }}><Link href={transactionUrl(view.selected.id, "subtree")} className="text-link">Xem giao dịch của cả nhánh {view.selected.name} →</Link><br /><Link href={transactionUrl(view.selected.id, "direct")} className="text-link">Xem giao dịch ghi trực tiếp ở {view.selected.name} →</Link></p>}
    {view.rows.length > 0 && <details style={{ marginTop: 14 }}><summary>Bảng số liệu chi tiêu ròng theo danh mục</summary>
      <div className="table-wrap"><table><thead><tr><th scope="col">Danh mục</th><th scope="col">Chi tiêu ròng (VND)</th></tr></thead><tbody>
        {view.rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{formatVnd(row.amount)}</td></tr>)}
      </tbody></table></div>
    </details>}
    <p className="subtitle" style={{ marginTop: 12 }}>Tổng chi tiêu ròng trong nhóm: <strong>{formatVnd(view.total)}</strong></p>
  </section>;
}

export function CashflowBars({ series, transactionUrl }: { series: CashFlowPoint[]; transactionUrl: string }) {
  const [granularity, setGranularity] = useState<CashFlowGranularity>("day");
  const grouped = groupCashFlowSeries(series, granularity);
  const data = grouped.map(row => ({ ...row, label: cashFlowLabel(row.date, granularity), incomeValue: Number(row.income), expenseValue: Number(row.expense) }));
  const labels = { day: "ngày", week: "tuần", month: "tháng" };

  return <section className="card card-pad">
    <div className="section-header"><div><h2 className="section-title">Dòng tiền thu – chi</h2><p className="section-subtitle">Theo {labels[granularity]} phát sinh · VND</p></div><Link className="text-link" href={transactionUrl}>Chi tiết →</Link></div>
    <div className="field" style={{ maxWidth: 190, marginBottom: 12 }}><label htmlFor="cashflow-grouping">Nhóm dữ liệu</label>
      <select id="cashflow-grouping" value={granularity} onChange={e => setGranularity(e.target.value as CashFlowGranularity)}>
        <option value="day">Theo ngày</option><option value="week">Theo tuần (thứ Hai)</option><option value="month">Theo tháng</option>
      </select></div>
    {data.length ? <>
      <div className="chart-wrap" role="img" aria-label={`Biểu đồ thu nhập và chi tiêu theo ${labels[granularity]}`}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, left: -13, bottom: 0 }}>
          <CartesianGrid stroke="var(--finova-chart-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tickFormatter={compactVnd} width={78} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "var(--finova-surface-raised)", border: "1px solid var(--finova-border)", borderRadius: 12, color: "var(--finova-text)" }} formatter={fullVnd} /><Legend />
          <Bar name="Thu nhập" dataKey="incomeValue" fill="var(--finova-income)" radius={[5, 5, 0, 0]} maxBarSize={28} />
          <Bar name="Chi tiêu ròng" dataKey="expenseValue" fill="var(--finova-expense)" radius={[5, 5, 0, 0]} maxBarSize={28} />
        </BarChart></ResponsiveContainer>
      </div>
      <details style={{ marginTop: 12 }}><summary>Bảng dữ liệu thu – chi theo {labels[granularity]}</summary>
        <div className="table-wrap"><table><thead><tr><th>Kỳ</th><th>Thu nhập</th><th>Chi tiêu ròng</th><th>Chênh lệch</th></tr></thead><tbody>
          {grouped.map(row => <tr key={row.date}><td>{cashFlowLabel(row.date, granularity)}</td><td>{formatVnd(row.income)}</td><td>{formatVnd(row.expense)}</td><td>{formatVnd(row.surplus)}</td></tr>)}
        </tbody></table></div>
      </details>
    </> : <div className="empty"><ArrowLeftRight /><strong>Chưa có số liệu</strong><p>Biểu đồ sẽ hiển thị khi có giao dịch thực tế trong kỳ.</p></div>}
  </section>;
}

type AssetWallet = { id: string; name: string; type: string; balance: string; archived: boolean; includeInAvailable: boolean };

export function WalletBalanceBars({ wallets, transactionUrl }: { wallets: AssetWallet[]; transactionUrl: string }) {
  // Wallets are ASSET ledger accounts; cards and liabilities have their own models.
  const assets = wallets.filter(w => ["CASH", "BANK", "EWALLET", "SAVINGS"].includes(w.type));
  const chart = assets.map(w => ({ ...w, displayName: w.name.length > 20 ? `${w.name.slice(0, 19)}…` : w.name, value: Number(w.balance) }));
  const transactionsForWallet = (id: string) => {
    const [path, query = ""] = transactionUrl.split("?");
    const params = new URLSearchParams(query);
    params.set("walletId", id);
    return `${path}?${params.toString()}`;
  };
  return <section className="card card-pad">
    <div className="section-header"><div><h2 className="section-title">Số dư theo ví</h2><p className="section-subtitle">Tài sản ghi sổ trước ngày kết thúc kỳ · không cộng hạn mức tín dụng</p></div><Link href="/wallets" className="text-link">Quản lý ví →</Link></div>
    {assets.length ? <>
      <div role="img" aria-label="Biểu đồ số dư tài sản theo từng ví" style={{ height: Math.min(380, Math.max(180, assets.length * 49)), marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={chart} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--finova-chart-grid)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={compactVnd} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="displayName" width={106} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "var(--finova-surface-raised)", border: "1px solid var(--finova-border)", borderRadius: 12, color: "var(--finova-text)" }} formatter={fullVnd} /><Bar name="Số dư" dataKey="value" fill="var(--finova-primary)" radius={[0, 5, 5, 0]} maxBarSize={24} />
        </BarChart></ResponsiveContainer>
      </div>
      <div className="legend-list" style={{ marginTop: 16 }} aria-label="Số dư sổ cái chính xác">
        {assets.map(w => <Link key={w.id} href={transactionsForWallet(w.id)} className="legend-row"><span className="legend-label"><WalletCards size={17} color="#1E5EFF" />{w.name}{w.archived ? " (lưu trữ)" : ""}</span><strong>{formatVnd(w.balance)}</strong></Link>)}
      </div>
    </> : <div className="empty"><WalletCards /><strong>Chưa có ví tài sản</strong><p>Thêm ví để theo dõi số dư thực tế.</p></div>}
  </section>;
}
