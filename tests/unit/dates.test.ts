import { describe, expect, it } from "vitest";
import { cycleDates, localDay, parseRange, thisMonthRange, vndDayStart } from "@/lib/dates";

describe("Múi giờ báo cáo Việt Nam", () => {
  it("chuyển UTC sang ngày phát sinh tại Việt Nam", () => {
    expect(localDay(new Date("2026-10-31T17:30:00.000Z"))).toBe("2026-11-01");
    expect(vndDayStart("2026-11-01").toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });
  it("từ chối ngày không có thật và năm không nhuận", () => {
    expect(() => vndDayStart("2026-02-29")).toThrow();
    expect(() => vndDayStart("2026-04-31")).toThrow();
    expect(() => vndDayStart("2026-00-10")).toThrow();
    expect(vndDayStart("2024-02-29").toISOString()).toBe("2024-02-28T17:00:00.000Z");
  });
  it("kỳ báo cáo là khoảng nửa mở; tháng 12 qua năm mới", () => {
    expect(thisMonthRange(new Date("2026-12-20T13:00:00Z"))).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
    const range = parseRange("2026-10-01", "2026-11-01");
    expect(range.from.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(() => parseRange("2026-11-01", "2026-10-01")).toThrow();
  });
});

describe("Chu kỳ sao kê thẻ", () => {
  it("chuyển chu kỳ qua năm mới và xử lý đúng ngày chốt", () => {
    expect(cycleDates("2026-12-20", 20, 5)).toMatchObject({ lastStatementDate: "2026-11-20", nextCloseDate: "2026-12-20", lastPaymentDueDate: "2026-12-05", projectedDueDate: "2027-01-05" });
    expect(cycleDates("2026-12-21", 20, 5)).toMatchObject({ lastStatementDate: "2026-12-20", nextCloseDate: "2027-01-20", lastPaymentDueDate: "2027-01-05", projectedDueDate: "2027-02-05" });
    expect(cycleDates("2027-01-02", 28, 28)).toMatchObject({ lastStatementDate: "2026-12-28", nextCloseDate: "2027-01-28", lastPaymentDueDate: "2027-01-28", projectedDueDate: "2027-02-28" });
  });
});
