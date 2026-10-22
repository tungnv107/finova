import { Decimal, money } from "@/lib/money";

export type CashFlowGranularity = "day" | "week" | "month";
export type CashFlowPoint = { date: string; income: string; expense: string; surplus: string };

function bucketDate(day: string, granularity: CashFlowGranularity) {
  if (granularity === "day") return day;
  if (granularity === "month") return `${day.slice(0, 7)}-01`;
  // Journal dates are YYYY-MM-DD in the workspace timezone. Work in UTC
  // only for calendar arithmetic so the browser's timezone cannot shift a week.
  const date = new Date(`${day}T00:00:00Z`);
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

export function groupCashFlowSeries(rows: readonly CashFlowPoint[], granularity: CashFlowGranularity): CashFlowPoint[] {
  const groups = new Map<string, { income: Decimal; expense: Decimal }>();
  for (const row of rows) {
    const date = bucketDate(row.date, granularity);
    const current = groups.get(date) ?? { income: new Decimal(0), expense: new Decimal(0) };
    current.income = current.income.plus(row.income);
    current.expense = current.expense.plus(row.expense);
    groups.set(date, current);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({
    date, income: money(row.income), expense: money(row.expense), surplus: money(row.income.minus(row.expense)),
  }));
}

export function cashFlowLabel(date: string, granularity: CashFlowGranularity) {
  if (granularity === "month") return `${date.slice(5, 7)}/${date.slice(0, 4)}`;
  const shortDate = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  return granularity === "week" ? `Tuần ${shortDate}` : shortDate;
}
