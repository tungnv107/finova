import { describe, expect, it } from "vitest";
import { occurrenceDate, scheduleDates } from "@/lib/recurrence";

describe("calendar-safe recurring dates", () => {
  it("keeps the original monthly anchor", () => {
    expect([0,1,2,3].map(i => occurrenceDate("2026-01-31", "MONTHLY", 1, i)))
      .toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("clamps leap year anniversaries without drift", () => {
    expect(occurrenceDate("2024-02-29", "YEARLY", 1, 2)).toBe("2026-02-28");
    expect(occurrenceDate("2024-02-29", "YEARLY", 1, 4)).toBe("2028-02-29");
  });
  it("respects end date and interval", () => {
    expect(scheduleDates("2026-10-01", "2026-10-15", "WEEKLY", 2, "2026-11-01"))
      .toEqual(["2026-10-01", "2026-10-15"]);
  });
  it("rejects invalid date", () => expect(() => occurrenceDate("2026-02-30", "DAILY", 1, 0)).toThrow());
});
