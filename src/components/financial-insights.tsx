"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatVnd } from "@/lib/money";
import type { getFinancialIntelligence, explainFinancialIntelligence } from "@/server/ai/insights";
import styles from "./financial-ai.module.css";

type Data = Awaited<ReturnType<typeof getFinancialIntelligence>>;
const riskLabel = { OVER: "Đã vượt hạn mức", AT_RISK: "Có nguy cơ vượt", ON_TRACK: "Trong hạn mức dự kiến", INSUFFICIENT: "Chưa đủ dữ liệu dự báo" };
export function FinancialInsights({ initial, budgetsOnly = false }: { initial: Data; budgetsOnly?: boolean }) {
  const router = useRouter();
  const [narrative, setNarrative] = useState<Awaited<ReturnType<typeof explainFinancialIntelligence>>["narrative"] | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [limits, setLimits] = useState<Record<string, string>>({}), [applied, setApplied] = useState<string[]>([]);
  async function explain() {
    setBusy("explain"); setError("");
    try {
      const r = await fetch("/api/v1/ai/insights", { method: "POST" }), result = await r.json();
      if (!r.ok) throw new Error(result.error?.message || "Chưa phân tích được.");
      setNarrative(result.data.narrative);
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); } finally { setBusy(""); }
  }
  async function apply(suggestion: Data["suggestions"][number]) {
    setBusy(suggestion.categoryId); setError(""); setMessage("");
    try {
      const r = await fetch("/api/v1/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Ngân sách ${suggestion.name}`.slice(0, 100),
        scope: "CATEGORY", period: "MONTHLY", start: initial.period.start, endExclusive: initial.period.endExclusive, categoryIds: [suggestion.categoryId], limitAmount: limits[suggestion.categoryId] ?? suggestion.limitAmount }) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error?.message || "Không tạo được ngân sách.");
      setApplied(ids => [...ids, suggestion.categoryId]); setMessage(`Đã tạo ngân sách ${suggestion.name}.`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); } finally { setBusy(""); }
  }
  return <div className={styles.section}>
    {!budgetsOnly && <><div className="page-head"><div><span className={styles.eyebrow}><Sparkles size={16} /> FINOVA AI</span><h1 className="page-title">Hiểu dòng tiền của bạn</h1><p className="subtitle">Tháng {initial.period.start.slice(5, 7)}/{initial.period.start.slice(0, 4)} · Đến {initial.period.today} · Dữ liệu sổ cái thực tế</p></div><Link href="/imports" className="button button-outline">Nhập sao kê</Link></div>
      <div className={styles.metrics}>{[["Thu nhập tháng này", initial.totals.income], ["Chi tiêu tháng này", initial.totals.expense], ["Chênh lệch thu chi", initial.totals.surplus], ["Dự báo chi cuối tháng", initial.totals.projectedExpense]].map(([label, value]) => <div className={`card ${styles.metric}`} key={label}><span>{label}</span><strong>{formatVnd(value)}</strong></div>)}</div>
      <section className={`card card-pad ${styles.section}`}><h2 className="section-title">Điều gì đang làm thay đổi chi tiêu?</h2>
        {!initial.hasData ? <p>Chưa có dữ liệu. Nhập sao kê hoặc ghi giao dịch để bắt đầu phân tích.</p> : <>
          <p>So với {initial.period.comparisonDays} ngày đầu tháng trước, chi tiêu thay đổi <strong>{formatVnd(initial.comparison.delta)}</strong>{initial.comparison.percent !== null ? ` (${initial.comparison.percent}%)` : ". Chưa có mức chi kỳ trước để tính phần trăm"}.</p>
          <div className={styles.cards}>{initial.drivers.slice(0, 6).map(c => <article key={c.id ?? c.name}><h3>{c.name}</h3><p>Hiện tại {formatVnd(c.amount)} · Kỳ trước {formatVnd(c.previous)}</p><strong className={c.delta.startsWith("-") ? styles.good : styles.warning}>Chênh lệch {formatVnd(c.delta)}</strong><p className="section-subtitle">Đóng góp theo danh mục; chưa đủ thông tin để kết luận nguyên nhân sinh hoạt.</p></article>)}</div>
        </>}
        <p className="section-subtitle">Khi bấm phân tích, số liệu tổng hợp theo danh mục sẽ được gửi tới OpenAI. Không gửi tên tài khoản, số tài khoản hoặc nội dung từng giao dịch.</p>
        <button type="button" className="button button-primary" disabled={Boolean(busy) || !initial.aiAvailable || !initial.hasData} onClick={explain}>{busy === "explain" ? "Đang phân tích…" : "Nhận xét và khuyến nghị bằng AI"}</button>
        {!initial.aiAvailable && <p className="section-subtitle">Chưa cấu hình dịch vụ AI. Số liệu và dự báo vẫn hoạt động.</p>}
        {narrative && <div className={styles.results}><h3>Nhận xét AI</h3><p>{narrative.summary}</p><ul>{narrative.observations.map((text, i) => <li key={i}>{text}</li>)}</ul><h3>Gợi ý hành động</h3><ul>{narrative.recommendations.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      </section>
      <section className={`card card-pad ${styles.section}`}><h2 className="section-title">Xu hướng bốn tháng</h2><p className="section-subtitle">Tháng hiện tại mới tính đến hôm nay; tháng trống có thể chưa được nhập dữ liệu.</p><div className="table-wrap"><table><thead><tr><th>Tháng</th><th>Thu</th><th>Chi</th><th>Chênh lệch</th></tr></thead><tbody>{initial.months.map(m => <tr key={m.month}><td>{m.month}</td><td>{formatVnd(m.income)}</td><td>{formatVnd(m.expense)}</td><td>{formatVnd(m.surplus)}</td></tr>)}</tbody></table></div></section>
    </>}
    <section className={`card card-pad ${styles.section}`}><h2 className="section-title">Ngân sách thông minh</h2><p className="section-subtitle">Đề xuất tháng này dựa trên tối đa ba tháng lịch sử. Có thể chỉnh hạn mức trước khi áp dụng. Ngân sách tổng và ngân sách danh mục là các góc nhìn riêng, không cộng dồn.</p>
      {initial.forecasts.length > 0 && <><h3>Cảnh báo ngân sách đang dùng</h3><div className={styles.cards}>{initial.forecasts.map(b => <article key={b.id}><h3>{b.name}</h3><strong className={b.risk === "OVER" || b.risk === "AT_RISK" ? styles.warning : styles.good}>{riskLabel[b.risk]}</strong><p>Đã chi {b.used === null ? "—" : formatVnd(b.used)} / {formatVnd(b.limitAmount)}</p><p>Dự báo đến {b.endExclusive}: {b.projected === null ? "Chưa đủ dữ liệu trong cửa sổ phân tích" : formatVnd(b.projected)}</p></article>)}</div></>}
      {!initial.suggestions.length && <p>Chưa đủ dữ liệu chi tiêu để đề xuất. Hãy ghi giao dịch hoặc nhập sao kê.</p>}
      <div className={styles.cards}>{initial.suggestions.map(s => <article key={s.categoryId}><h3>{s.name}</h3><p>{s.reason}</p><p>Đã chi {formatVnd(s.used)} · Dự báo {formatVnd(s.projected)}</p><p className={s.risk === "OVER" || s.risk === "AT_RISK" ? styles.warning : styles.good}>{riskLabel[s.risk]} theo hạn mức đề xuất</p><small>Độ tin cậy {s.confidence === "LOW" ? "thấp" : "trung bình"}. Gợi ý còn lại mỗi ngày: {formatVnd(s.dailyRemaining)}.</small>
        <form onSubmit={e => { e.preventDefault(); void apply(s); }}><div className="field"><label htmlFor={`smart-budget-${s.categoryId}`}>Hạn mức muốn áp dụng (VND)</label><input id={`smart-budget-${s.categoryId}`} inputMode="numeric" pattern="[1-9][0-9]{0,15}" required value={limits[s.categoryId] ?? s.limitAmount} onChange={e => setLimits(previous => ({ ...previous, [s.categoryId]: e.target.value }))} /></div><button type="submit" className="button button-outline" disabled={Boolean(busy) || applied.includes(s.categoryId) || initial.coveredCategoryIds.includes(s.categoryId)}>{initial.coveredCategoryIds.includes(s.categoryId) ? "Đã có ngân sách trong tháng" : applied.includes(s.categoryId) ? "Đã áp dụng" : busy === s.categoryId ? "Đang lưu…" : "Áp dụng hạn mức"}</button></form>
      </article>)}</div>
      <p className="section-subtitle">{initial.method}</p>
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </div>;
}
