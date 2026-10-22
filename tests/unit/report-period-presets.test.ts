import { describe, expect, it } from "vitest";
import { reportPeriodPreset } from "@/lib/report-period-presets";
import { parseRange } from "@/lib/dates";

describe("report period shortcuts", () => {
  it("uses Vietnam calendar near UTC year boundary", () => {
    const now = new Date("2026-12-31T18:30:00Z"); // 01/01/2027 in Vietnam
    expect(reportPeriodPreset("thisMonth", now)).toEqual({ start: "2027-01-01", endExclusive: "2027-02-01" });
    expect(reportPeriodPreset("lastMonth", now)).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
    expect(reportPeriodPreset("threeMonths", now)).toEqual({ start: "2026-11-01", endExclusive: "2027-02-01" });
    expect(reportPeriodPreset("thisYear", now)).toEqual({ start: "2027-01-01", endExclusive: "2028-01-01" });
  });

  it("handles leap year, exclusive end, and server range limits", () => {
    const now = new Date("2024-03-15T00:00:00Z");
    expect(reportPeriodPreset("lastMonth", now)).toEqual({ start: "2024-02-01", endExclusive: "2024-03-01" });
    for (const key of ["thisMonth", "lastMonth", "threeMonths", "thisYear"] as const) {
      const range = reportPeriodPreset(key, now);
      expect(parseRange(range.start, range.endExclusive).endExclusive).toBe(range.endExclusive);
    }
  });
});
