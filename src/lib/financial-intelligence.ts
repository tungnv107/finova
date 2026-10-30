import { Decimal, money } from "@/lib/money";
import { localDay, vndDayStart } from "@/lib/dates";

export type FinancialDay = { day: string; kind: "INCOME" | "EXPENSE"; categoryId: string | null; name: string; amount: string };
export function monthOffset(day: string, offset: number) { return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 + offset, 1)).toISOString().slice(0, 10); }
const sum = (rows: FinancialDay[]) => rows.reduce((total, row) => total.plus(row.amount), new Decimal(0));
const maxZero = (value: Decimal) => Decimal.max(0, value);

export function financialIntelligence(rows: FinancialDay[], categories: { id: string; name: string }[], now = new Date()) {
  const today = localDay(now), start = monthOffset(today, 0), endExclusive = monthOffset(today, 1);
  const previousStart = monthOffset(today, -1);
  const daysInMonth = Math.round((vndDayStart(endExclusive).getTime() - vndDayStart(start).getTime()) / 86400000);
  const elapsedDays = Number(today.slice(8));
  const previousDays = Math.round((vndDayStart(start).getTime() - vndDayStart(previousStart).getTime()) / 86400000);
  const comparisonDays = Math.min(elapsedDays, previousDays);
  const current = rows.filter(r => r.day >= start && r.day <= today);
  const currentComparable = current.filter(r => Number(r.day.slice(8)) <= comparisonDays);
  const previous = rows.filter(r => r.day >= previousStart && r.day < start && Number(r.day.slice(8)) <= comparisonDays);
  const past = rows.filter(r => r.day >= monthOffset(today, -3) && r.day < start);
  const earliest = past.map(r => r.day).sort()[0];
  const historyMonths = earliest ? Math.min(3, (Number(start.slice(0, 4)) - Number(earliest.slice(0, 4))) * 12 + Number(start.slice(5, 7)) - Number(earliest.slice(5, 7))) : 0;
  const income = sum(current.filter(r => r.kind === "INCOME")), expense = sum(current.filter(r => r.kind === "EXPENSE"));
  const previousExpense = sum(previous.filter(r => r.kind === "EXPENSE")), comparableExpense = sum(currentComparable.filter(r => r.kind === "EXPENSE"));
  const delta = comparableExpense.minus(previousExpense);
  const drivers = [...new Map([...currentComparable, ...previous].filter(r => r.kind === "EXPENSE").map(r => [r.categoryId ?? r.name, { id: r.categoryId, name: r.name }])).entries()].map(([key, c]) => {
    const match = (r: FinancialDay) => r.kind === "EXPENSE" && (r.categoryId ?? r.name) === key;
    const amount = sum(currentComparable.filter(match)), prior = sum(previous.filter(match));
    return { ...c, amount: money(amount), previous: money(prior), delta: money(amount.minus(prior)) };
  }).sort((a, b) => new Decimal(b.delta).comparedTo(a.delta));
  const averageIncome = historyMonths ? maxZero(sum(past.filter(r => r.kind === "INCOME")).div(historyMonths)) : new Decimal(0);
  const rawSuggestions = categories.map(category => {
    const history = maxZero(sum(past.filter(r => r.kind === "EXPENSE" && r.categoryId === category.id)));
    const used = maxZero(sum(current.filter(r => r.kind === "EXPENSE" && r.categoryId === category.id)));
    const projected = used.div(elapsedDays).mul(daysInMonth);
    const hasCategoryHistory = history.gt(0);
    const baseline = historyMonths && hasCategoryHistory ? history.div(historyMonths) : projected;
    return { ...category, used, projected, hasCategoryHistory, baseline, proposed: baseline.mul(1.05) };
  }).filter(c => c.proposed.gt(0));
  const proposedTotal = rawSuggestions.reduce((s, c) => s.plus(c.proposed), new Decimal(0));
  const envelope = averageIncome.mul(0.8);
  const scale = envelope.gt(0) && proposedTotal.gt(envelope) ? envelope.div(proposedTotal) : new Decimal(1);
  const suggestions = rawSuggestions.map(c => {
    const limit = Decimal.min("9999999999999999", Decimal.max(1, c.proposed.mul(scale).floor()));
    return { categoryId: c.id, name: c.name, used: money(c.used), projected: money(c.projected), limitAmount: money(limit),
      risk: c.used.gt(limit) ? "OVER" as const : elapsedDays < 7 ? "INSUFFICIENT" as const : c.projected.gt(limit) ? "AT_RISK" as const : "ON_TRACK" as const,
      dailyRemaining: money(maxZero(limit.minus(c.used)).div(Math.max(1, daysInMonth - elapsedDays))),
      reason: historyMonths && c.hasCategoryHistory ? `Trung bình ${historyMonths} tháng có lịch sử gần nhất + 5% dự phòng${scale.lt(1) ? ", điều chỉnh theo 80% thu nhập trung bình" : ""}.` : `Ước lượng theo nhịp chi tháng này + 5%; danh mục chưa có lịch sử chi tháng trước${scale.lt(1) ? ", điều chỉnh theo 80% thu nhập trung bình" : ""}.`,
      confidence: historyMonths >= 3 && c.hasCategoryHistory ? "MEDIUM" : "LOW" };
  });
  const months = [-3, -2, -1, 0].map(offset => {
    const month = monthOffset(today, offset).slice(0, 7), selected = rows.filter(r => r.day.startsWith(month) && r.day <= today);
    const inc = sum(selected.filter(r => r.kind === "INCOME")), exp = sum(selected.filter(r => r.kind === "EXPENSE"));
    return { month, income: money(inc), expense: money(exp), surplus: money(inc.minus(exp)) };
  });
  return { period: { start, endExclusive, today, elapsedDays, daysInMonth, comparisonDays, previousStart },
    totals: { income: money(income), expense: money(expense), surplus: money(income.minus(expense)), projectedExpense: money(maxZero(expense).div(elapsedDays).mul(daysInMonth)) },
    comparison: { currentExpense: money(comparableExpense), previousExpense: money(previousExpense), delta: money(delta), percent: previousExpense.gt(0) ? delta.div(previousExpense).mul(100).toFixed(1) : null },
    drivers, months, suggestions, historyMonths, hasData: rows.length > 0,
    method: "Thu chi ròng từ sổ cái, gồm hoàn tiền/đảo bút toán; loại chuyển ví, chỉ tính phí. So sánh cùng số ngày lịch với tháng trước. Dự báo tuyến tính theo ngày đã qua, không phải cam kết chi tiêu." };
}
