import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const { countOrders, aggregatePayments, usageKpis, analyticsEnabled } = vi.hoisted(() => ({
  countOrders: vi.fn(), aggregatePayments: vi.fn(), usageKpis: vi.fn(), analyticsEnabled: vi.fn(),
}));
vi.mock("../../src/lib/db", () => ({ prisma: {
  billingOrder: { count: countOrders }, paymentAllocation: { aggregate: aggregatePayments },
} }));
vi.mock("../../src/modules/admin/usage", () => ({
  getUsageKpis: usageKpis, usageAnalyticsEnabled: analyticsEnabled,
}));

import { adminExportPeriod, encodeAdminAggregateReport, prepareAdminAggregateReport } from "../../src/modules/admin/analytics-export";

const now = new Date("2026-10-24T16:59:59.999Z"); // 23:59:59 Vietnam

beforeEach(() => {
  countOrders.mockReset().mockResolvedValueOnce(3).mockResolvedValueOnce(2);
  aggregatePayments.mockReset().mockResolvedValue({ _count: { _all: 2 }, _sum: { amountVnd: BigInt(228000) } });
  usageKpis.mockReset();
  analyticsEnabled.mockReset().mockReturnValue(true);
});

describe("private aggregate exports", () => {
  it("uses midnight Vietnam UTC boundaries across the UTC date rollover", () => {
    const period = adminExportPeriod(7, new Date("2026-10-23T17:00:00.000Z"));
    expect(period).toEqual({
      fromVn: "2026-10-18", untilVn: "2026-10-24",
      startUtc: new Date("2026-10-17T17:00:00.000Z"), endUtc: new Date("2026-10-24T17:00:00.000Z"),
    });
  });

  it("exports only reconciled aggregate totals and VND, with no source identifiers", async () => {
    const report = await prepareAdminAggregateReport("billing", 7, now);
    const bounds = { gte: new Date("2026-10-17T17:00:00.000Z"), lt: new Date("2026-10-24T17:00:00.000Z") };
    expect(countOrders).toHaveBeenNthCalledWith(1, { where: { createdAt: bounds } });
    expect(countOrders).toHaveBeenNthCalledWith(2, { where: { status: "PAID", paidAt: bounds } });
    expect(aggregatePayments).toHaveBeenCalledWith({ where: { matchedAt: bounds }, _count: { _all: true }, _sum: { amountVnd: true } });
    expect(report.rows).toHaveLength(4);
    expect(report.rows[3]).toEqual(["2026-10-18", "2026-10-24", "Tiền đã phân bổ (gross, chưa trừ hoàn tiền)", 228000, "VND", "Asia/Ho_Chi_Minh"]);
    const output = new TextDecoder().decode(await encodeAdminAggregateReport(report, "csv"));
    const bytes = await encodeAdminAggregateReport(report, "csv");
    expect(Array.from(bytes.slice(0, 3))).toEqual([239, 187, 191]);
    expect(output).toContain("228000,\"VND\"");
    expect(output).not.toMatch(/userId|orderId|providerTransactionId|accountNumber|reference/);
  });

  it("keeps empty days and encodes the same traffic rows in CSV and XLSX", async () => {
    usageKpis.mockResolvedValue({ trends: Array.from({ length: 90 }, (_, index) => ({
      day: new Date(Date.UTC(2026, 6, 27 + index)).toISOString().slice(0, 10), activeUsers: index === 89 ? 1 : 0,
      pageViews: index === 89 ? 2 : 0,
    })) });
    const report = await prepareAdminAggregateReport("traffic", 7, now);
    expect(report.rows).toHaveLength(7);
    expect(report.rows.at(-1)).toEqual(["2026-10-24", 1, 2, "Asia/Ho_Chi_Minh"]);
    const output = await encodeAdminAggregateReport(report, "xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(output) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets[0]?.rowCount).toBe(8);
    expect(workbook.worksheets[0]?.getRow(8).getCell(3).value).toBe(2);
  });

  it("does not permit exporting traffic data when collection is switched off", async () => {
    analyticsEnabled.mockReturnValue(false);
    await expect(prepareAdminAggregateReport("traffic", 7, now)).rejects.toMatchObject({ status: 409, code: "USAGE_ANALYTICS_DISABLED" });
    expect(usageKpis).not.toHaveBeenCalled();
  });

  it("escapes spreadsheet-formula strings in CSV", async () => {
    const bytes = await encodeAdminAggregateReport({ kind: "billing", days: 7, fromVn: "2026-01-01", untilVn: "2026-01-07",
      columns: ["Label"], rows: [["=1+1"], [" @SUM(A1)"], ["-2+3"], ["ordinary"]],
    }, "csv");
    const output = new TextDecoder().decode(bytes);
    expect(output).toContain("\"'=1+1\"");
    expect(output).toContain("\"' @SUM(A1)\"");
    expect(output).toContain("\"'-2+3\"");
  });

  it("rejects financial sums that cannot be represented exactly as JavaScript numbers", async () => {
    aggregatePayments.mockResolvedValueOnce({ _count: { _all: 1 }, _sum: { amountVnd: BigInt("9007199254740993") } });
    await expect(prepareAdminAggregateReport("billing", 7, now)).rejects.toMatchObject({
      status: 409, code: "EXPORT_TOTAL_OUT_OF_RANGE",
    });
  });
});
