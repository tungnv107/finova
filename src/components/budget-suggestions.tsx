"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarDays, Car, Check, ChevronDown, GraduationCap, Info, LayoutGrid, ReceiptText, Sparkles, Ticket, Utensils } from "lucide-react";
import { formatVnd } from "@/lib/money";
import type { getFinancialIntelligence } from "@/server/ai/insights";
import styles from "./budgets.module.css";

type Data = Awaited<ReturnType<typeof getFinancialIntelligence>>;
const riskLabels = { OVER: "Đã vượt mức gợi ý", AT_RISK: "Có nguy cơ vượt", ON_TRACK: "Trong mức dự kiến", INSUFFICIENT: "Chưa đủ dữ liệu" };
const riskStyles = { OVER: styles.danger, AT_RISK: styles.warning, ON_TRACK: styles.good, INSUFFICIENT: styles.neutral };

function categoryAppearance(name: string) {
  const key = name.toLocaleLowerCase("vi");
  if (/ăn|uống|thực phẩm/.test(key)) return { Icon: Utensils, tone: styles.orange };
  if (/đi lại|xe|di chuyển/.test(key)) return { Icon: Car, tone: styles.blue };
  if (/hóa đơn|điện|nước|nhà/.test(key)) return { Icon: ReceiptText, tone: styles.purple };
  if (/giải trí|du lịch/.test(key)) return { Icon: Ticket, tone: styles.pink };
  if (/giáo dục|học/.test(key)) return { Icon: GraduationCap, tone: styles.teal };
  return { Icon: LayoutGrid, tone: styles.slate };
}

export function BudgetSuggestions({ initial }: { initial: Data }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [message, setMessage] = useState("");

  async function apply(suggestion: Data["suggestions"][number]) {
    if (busy) return;
    setBusy(suggestion.categoryId); setError(null); setMessage("");
    try {
      const response = await fetch("/api/v1/budgets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Ngân sách ${suggestion.name}`.slice(0, 100), scope: "CATEGORY", period: "MONTHLY",
          start: initial.period.start, endExclusive: initial.period.endExclusive, categoryIds: [suggestion.categoryId],
          limitAmount: limits[suggestion.categoryId] ?? suggestion.limitAmount }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Không tạo được ngân sách.");
      setApplied(ids => [...ids, suggestion.categoryId]);
      setMessage(`Đã tạo ngân sách ${suggestion.name}.`);
      router.refresh();
    } catch (e) { setError({ id: suggestion.categoryId, message: e instanceof Error ? e.message : "Lỗi kết nối. Vui lòng thử lại." }); }
    finally { setBusy(""); }
  }

  return <section className={styles.suggestions} aria-labelledby="budget-suggestions-heading">
    <div className={styles.suggestionHead}><div className={styles.suggestionTitle}><span className={styles.sparkIcon}><Sparkles size={21} /></span><div><h2 id="budget-suggestions-heading">Gợi ý ngân sách</h2><p>Một điểm khởi đầu từ thói quen chi tiêu của bạn.</p></div></div><span className={styles.month}><CalendarDays size={15} /> Tháng {Number(initial.period.start.slice(5, 7))}/{initial.period.start.slice(0, 4)}</span></div>
    {initial.suggestions.length > 0 ? <>
      <div className={styles.suggestionIntro}><Info size={16} /><p>Dựa trên tối đa 3 tháng lịch sử. Xem chi tiết và điều chỉnh hạn mức phù hợp trước khi áp dụng.</p></div>
      <div className={styles.columnHead} aria-hidden="true"><span>Danh mục</span><span>Đã chi tháng này</span><span>Hạn mức gợi ý</span><span>Đánh giá theo gợi ý</span><span /></div>
      <div className={styles.suggestionList}>{initial.suggestions.map(s => {
        const { Icon, tone } = categoryAppearance(s.name);
        const isOpen = expanded === s.categoryId;
        const covered = initial.coveredCategoryIds.includes(s.categoryId) || applied.includes(s.categoryId);
        const value = limits[s.categoryId] ?? s.limitAmount;
        return <article className={styles.suggestionRow} key={s.categoryId}>
          <div className={styles.suggestionSummary}>
            <div className={styles.categoryName}><span className={`${styles.categoryIcon} ${tone}`}><Icon size={20} /></span><div><h3>{s.name}</h3><span>{covered ? "Đang có ngân sách" : "Ngân sách theo tháng"}</span></div></div>
            <div className={styles.suggestionNumber}><span>Đã chi tháng này</span><strong>{formatVnd(s.used)}</strong></div>
            <div className={`${styles.suggestionNumber} ${styles.suggestedLimit}`}><span>Hạn mức gợi ý</span><strong>{formatVnd(s.limitAmount)}</strong></div>
            <div className={styles.riskCell}><span className={`${styles.status} ${riskStyles[s.risk]}`}>{riskLabels[s.risk]}</span></div>
            <button type="button" className={styles.setupButton} disabled={Boolean(busy)} aria-expanded={isOpen} aria-controls={`suggestion-${s.categoryId}`} aria-label={`${isOpen ? "Thu gọn" : "Xem gợi ý"} ${s.name}`} onClick={() => setExpanded(isOpen ? null : s.categoryId)}>{covered ? <Check size={15} /> : null}<span>{covered ? "Chi tiết" : "Thiết lập"}</span><ChevronDown size={16} className={isOpen ? styles.rotated : ""} /></button>
          </div>
          {isOpen && <div id={`suggestion-${s.categoryId}`} className={styles.suggestionDetail}>
            <div className={styles.suggestionReason}><h4>Cơ sở đề xuất</h4><p>{s.reason}</p><div className={styles.detailFacts}><span>Dự báo cuối tháng<strong>{formatVnd(s.projected)}</strong></span><span>Còn lại mỗi ngày theo gợi ý<strong>{formatVnd(s.dailyRemaining)}</strong></span></div><small>Độ tin cậy {s.confidence === "LOW" ? "thấp" : "trung bình"}. Dự báo mang tính tham khảo.</small></div>
            {covered ? <div className={styles.appliedNotice}><Check size={20} /><div><strong>Danh mục này đã có ngân sách</strong><p>Quản lý và chỉnh sửa tại <Link href="/budgets" className="text-link">trang Ngân sách</Link>.</p></div></div> : <form className={styles.suggestionForm} onSubmit={e => { e.preventDefault(); void apply(s); }}>
              <div className="field"><label htmlFor={`smart-budget-${s.categoryId}`}>Hạn mức muốn áp dụng (VND)</label><input id={`smart-budget-${s.categoryId}`} inputMode="numeric" pattern="[1-9][0-9]{0,15}" required disabled={Boolean(busy)} value={value} aria-describedby={`smart-budget-help-${s.categoryId}`} onChange={e => setLimits(previous => ({ ...previous, [s.categoryId]: e.target.value }))} /><small id={`smart-budget-help-${s.categoryId}`}>{/^[1-9][0-9]{0,15}$/.test(value) ? formatVnd(value) : "Nhập số tiền nguyên lớn hơn 0, tối đa 16 chữ số."}</small></div>
              <button type="submit" className="button button-primary" disabled={Boolean(busy)}>{busy === s.categoryId ? "Đang lưu…" : "Áp dụng hạn mức"}<ArrowRight size={16} /></button>
              {error?.id === s.categoryId && <p className="form-error" role="alert">{error.message}</p>}
            </form>}
          </div>}
        </article>;
      })}</div>
    </> : <div className={styles.noSuggestions}><Sparkles size={26} /><h3>Gợi ý sẽ bắt đầu từ những khoản chi</h3><p>Ghi giao dịch hoặc nhập sao kê để nhận hạn mức phù hợp với thói quen của bạn.</p><Link className="button button-outline" href="/transactions">Xem giao dịch<ArrowRight size={16} /></Link></div>}
    {message && <p className={styles.successMessage} role="status"><Check size={16} />{message}</p>}
    {initial.forecasts.length > 0 && <details className={styles.method}><summary>Dự báo các ngân sách đang dùng <span>{initial.forecasts.length}</span><ChevronDown size={16} /></summary><div className={styles.forecastList}>{initial.forecasts.map(b => <div key={b.id}><strong>{b.name}</strong><span className={`${styles.status} ${riskStyles[b.risk]}`}>{b.risk === "OVER" ? "Đã vượt hạn mức" : riskLabels[b.risk]}</span><p>Đã chi {b.used === null ? "—" : formatVnd(b.used)} / {formatVnd(b.limitAmount)} · Dự báo đến trước {b.endExclusive.split("-").reverse().join("/")}: {b.projected === null ? "Chưa đủ dữ liệu" : formatVnd(b.projected)}</p></div>)}</div></details>}
    <details className={styles.method}><summary><Info size={14} /> Cách tính gợi ý và dự báo <ChevronDown size={16} /></summary><p>{initial.method} Ngân sách tổng và ngân sách danh mục được theo dõi riêng, không cộng dồn.</p></details>
  </section>;
}
