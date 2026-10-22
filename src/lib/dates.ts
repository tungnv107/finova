export const TIMEZONE = "Asia/Ho_Chi_Minh";

export function localDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function vndDayStart(date: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const utc = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!match || !utc || utc.toISOString().slice(0, 10) !== date) {
    throw new Error("Ngày không hợp lệ (YYYY-MM-DD).");
  }
  return new Date(`${date}T00:00:00+07:00`);
}

// Last closed cycle and upcoming cycle in Vietnam calendar days. The exact
// amount due remains the issuing bank's statement, not an app-side prediction.
export function cycleDates(today: string, statementDay: number, dueDay: number) {
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7)), day = Number(today.slice(8, 10));
  const closingMonth = new Date(Date.UTC(year, month - 1 + (day > statementDay ? 1 : 0), statementDay));
  const previousClose = new Date(Date.UTC(closingMonth.getUTCFullYear(), closingMonth.getUTCMonth() - 1, statementDay));
  const nextCloseDate = closingMonth.toISOString().slice(0, 10);
  const lastStatementDate = previousClose.toISOString().slice(0, 10);
  const start = new Date(vndDayStart(lastStatementDate).getTime() + 86400_000);
  const projectedDueDate = new Date(Date.UTC(closingMonth.getUTCFullYear(), closingMonth.getUTCMonth() + 1, dueDay)).toISOString().slice(0, 10);
  const lastPaymentDueDate = new Date(Date.UTC(previousClose.getUTCFullYear(), previousClose.getUTCMonth() + 1, dueDay)).toISOString().slice(0, 10);
  return { start, nextCloseDate, lastStatementDate, lastPaymentDueDate, projectedDueDate };
}

export function thisMonthRange(now = new Date()) {
  const date = localDay(now);
  const start = `${date.slice(0, 7)}-01`;
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const endExclusive = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

export function parseRange(start?: string | null, endExclusive?: string | null) {
  const current = thisMonthRange();
  const startLabel = start || current.start;
  const endLabel = endExclusive || current.endExclusive;
  const from = vndDayStart(startLabel);
  const to = vndDayStart(endLabel);
  if (to <= from || to.getTime() - from.getTime() > 366 * 86400_000) {
    throw new Error("Khoảng thời gian phải tăng dần và không quá 366 ngày.");
  }
  return { start: startLabel, endExclusive: endLabel, from, to };
}
