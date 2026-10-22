import { describe, expect, it } from "vitest";
import { budgetKpiChoice, compareKpi, overviewCalendar } from "@/lib/overview-kpis";
import { vndDayStart } from "@/lib/dates";

describe("Overview Vietnam calendar boundaries", () => {
  const window = (start: string, end: string, now: string) =>
    overviewCalendar(vndDayStart(start), vndDayStart(end), new Date(now));

  it("uses equal-length comparison windows across year and leap boundaries", () => {
    const result = window("2024-03-01", "2024-04-01", "2024-04-14T10:00:00+07:00");
    expect(result.previousFrom).toEqual(vndDayStart("2024-01-30"));
    expect(result.previousTo).toEqual(vndDayStart("2024-03-01"));
    expect(result.periodDays).toBe(31);
    expect(result.elapsedDays).toBe(31);
    expect(result.currentAsOf).toBe("2024-03-31");
    expect(result.previousAsOf).toBe("2024-02-29");
  });

  it("counts today at midnight in Vietnam but excludes tomorrow", () => {
    const result = window("2026-10-01", "2026-11-01", "2026-10-20T17:00:00Z");
    expect(result.elapsedDays).toBe(21); // exactly Oct 21, 00:00 in Vietnam
    expect(result.periodDays).toBe(31);
    expect(result.currentAsOf).toBe("2026-10-21");
    expect(result.previousFrom).toEqual(vndDayStart("2026-08-31"));
    expect(result.previousAsOf).toBe("2026-09-30");
  });

  it("handles one-day and wholly future ranges without a future net-worth snapshot", () => {
    const one = window("2026-10-21", "2026-10-22", "2026-10-21T00:01:00+07:00");
    expect(one.elapsedDays).toBe(1);
    expect(one.currentAsOf).toBe("2026-10-21");
    expect(one.previousAsOf).toBe("2026-10-20");
    expect(one.hasStarted).toBe(true);
    expect(one.actualTo).toEqual(vndDayStart("2026-10-22"));
    const future = window("2026-12-01", "2027-01-01", "2026-10-21T12:00:00+07:00");
    expect(future.currentAsOf).toBeNull();
    expect(future.previousAsOf).toBeNull();
    expect(future.hasStarted).toBe(false);
    expect(future.elapsedDays).toBe(0);
  });

  it("caps in-progress actuals and snapshots to the same Vietnam calendar day", () => {
    const ongoing = window("2026-10-01", "2026-11-01", "2026-10-21T09:15:00+07:00");
    expect(ongoing.actualTo).toEqual(vndDayStart("2026-10-22"));
    expect(ongoing.currentAsOf).toBe("2026-10-21");
    expect(ongoing.previousAsOf).toBe("2026-09-30");
    expect(ongoing.elapsedDays).toBe(21);
    const past = window("2026-09-01", "2026-10-01", "2026-10-21T09:15:00+07:00");
    expect(past.actualTo).toEqual(vndDayStart("2026-10-01"));
    expect(past.currentAsOf).toBe("2026-09-30");
    expect(past.elapsedDays).toBe(30);
  });
});

describe("Overview KPI comparison", () => {
  it("keeps exact VND deltas and signed percentages", () => {
    expect(compareKpi("9007199254740993", "9007199254740992")).toEqual({ change: "1", percent: "0" });
    expect(compareKpi("50", "100")).toEqual({ change: "-50", percent: "-50" });
    expect(compareKpi("-20", "-10")).toEqual({ change: "-10", percent: "-100" });
  });

  it("returns N/A for a zero baseline or undefined rates", () => {
    expect(compareKpi("400", "0")).toEqual({ change: "400", percent: null });
    expect(compareKpi(null, "25")).toEqual({ change: null, percent: null });
  });
});

describe("Overview budget selection", () => {
  const total = { id: "total", scope: "TOTAL" as const };
  const food = { id: "food", scope: "CATEGORY" as const };
  const travel = { id: "travel", scope: "GROUP" as const };

  it("prefers a single TOTAL over overlapping category/group budgets", () => {
    expect(budgetKpiChoice([food, total, travel])).toEqual(total);
  });

  it("only shows an unambiguous single budget when no TOTAL exists", () => {
    expect(budgetKpiChoice([food])).toEqual(food);
    expect(budgetKpiChoice([])).toBeNull();
    expect(budgetKpiChoice([food, travel])).toBeNull();
    expect(budgetKpiChoice([total, total])).toBeNull();
  });
});
