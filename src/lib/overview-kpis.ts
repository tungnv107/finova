import { Decimal, money } from "@/lib/money";
import { localDay, vndDayStart } from "@/lib/dates";

const DAY_MS = 86_400_000;

// All reporting boundaries are Vietnam midnight instants (UTC+07, no DST).
// Count the current calendar day even at 00:00. Never include future days as
// actuals. The prior comparison window always has the same calendar duration.
export function overviewCalendar(from: Date, to: Date, now = new Date()) {
  const duration = to.getTime() - from.getTime();
  const previousFrom = new Date(from.getTime() - duration);
  const previousTo = from;
  const tomorrow = new Date(vndDayStart(localDay(now)).getTime() + DAY_MS);
  const currentCutoff = new Date(Math.min(to.getTime(), tomorrow.getTime()));
  const previousCutoff = previousTo;
  const elapsed = Math.max(0, currentCutoff.getTime() - from.getTime());
  const hasStarted = from.getTime() < tomorrow.getTime();
  return {
    previousFrom, previousTo,
    actualTo: currentCutoff,
    hasStarted,
    currentAsOf: hasStarted ? localDay(new Date(currentCutoff.getTime() - DAY_MS)) : null,
    previousAsOf: hasStarted ? localDay(new Date(previousCutoff.getTime() - DAY_MS)) : null,
    elapsedDays: Math.round(elapsed / DAY_MS),
    periodDays: Math.round(duration / DAY_MS),
  };
}

export function compareKpi(current: string | null, previous: string | null) {
  if (current === null || previous === null) return { change: null, percent: null };
  const delta = new Decimal(current).minus(previous);
  return {
    change: money(delta),
    // A zero baseline has no mathematically defined percentage change.
    percent: new Decimal(previous).isZero()
      ? null
      : delta.div(new Decimal(previous).abs()).mul(100).toDecimalPlaces(2).toString(),
  };
}

export function budgetKpiChoice<T extends { scope: "TOTAL" | "CATEGORY" | "GROUP" }>(budgets: T[]): T | null {
  // A TOTAL budget overlaps its CATEGORY/GROUP budgets. Never sum their limits or usage.
  const total = budgets.filter(b => b.scope === "TOTAL");
  if (total.length === 1) return total[0];
  if (total.length > 1) return null;
  return budgets.length === 1 ? budgets[0] : null;
}
