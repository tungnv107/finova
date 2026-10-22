import { Decimal, money } from "@/lib/money";

// Projected fixed-principal plan, nominal annual interest / 12, declining
// principal balance. This does not accrue interest or record ledger entries.
function calendarMonth(anchor: string, months: number) {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7)) - 1;
  const day = Number(anchor.slice(8, 10));
  const first = new Date(Date.UTC(year, month + months, 1));
  const maxDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, maxDay))).toISOString().slice(0, 10);
}

export function projectedDebtSchedule(principal: string, annualRate: string, count: number, startDate: string, lastDueDate: string | null) {
  const firstDue = lastDueDate ? calendarMonth(lastDueDate, 1 - count) : calendarMonth(startDate, 1);
  if (firstDue <= startDate) return null;
  const total = new Decimal(principal);
  const regularPrincipal = total.div(count).floor();
  const monthlyRate = new Decimal(annualRate).div(1200);
  const rows: { installment: number; dueDate: string; principal: string; interest: string; total: string; remaining: string }[] = [];
  let balance = total;
  for (let i = 0; i < count; i++) {
    const principalDue = i === count - 1 ? balance : regularPrincipal;
    const interestDue = balance.mul(monthlyRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    balance = balance.minus(principalDue);
    const dueDate = lastDueDate ? calendarMonth(lastDueDate, i + 1 - count) : calendarMonth(startDate, i + 1);
    rows.push({ installment: i + 1, dueDate, principal: money(principalDue), interest: money(interestDue),
      total: money(principalDue.plus(interestDue)), remaining: money(balance) });
  }
  return rows;
}
