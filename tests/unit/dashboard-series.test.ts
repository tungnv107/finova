import { describe, expect, it } from "vitest";
import { cashFlowLabel, groupCashFlowSeries } from "@/lib/dashboard-series";

const sample = [
  { date: "2026-12-31", income: "100000000000000", expense: "250", surplus: "99999999999750" },
  { date: "2027-01-01", income: "150", expense: "500", surplus: "-350" },
  { date: "2027-01-04", income: "0", expense: "-100", surplus: "100" },
];

describe("dashboard cash-flow aggregation", () => {
  it("preserves daily postings and exact VND sums with refunds", () => {
    expect(groupCashFlowSeries(sample, "day")).toEqual(sample);
  });
  it("uses Monday local calendar weeks, including year boundaries", () => {
    expect(groupCashFlowSeries(sample, "week")).toEqual([
      { date: "2026-12-28", income: "100000000000150", expense: "750", surplus: "99999999999400" },
      { date: "2027-01-04", income: "0", expense: "-100", surplus: "100" },
    ]);
    expect(cashFlowLabel("2026-12-28", "week")).toBe("Tuần 28/12");
  });
  it("groups monthly independently of the runtime timezone", () => {
    expect(groupCashFlowSeries(sample, "month")).toEqual([
      { date: "2026-12-01", income: "100000000000000", expense: "250", surplus: "99999999999750" },
      { date: "2027-01-01", income: "150", expense: "400", surplus: "-250" },
    ]);
    expect(cashFlowLabel("2027-01-01", "month")).toBe("01/2027");
  });
  it("keeps a truly empty series empty", () => {
    expect(groupCashFlowSeries([], "week")).toEqual([]);
  });
});
