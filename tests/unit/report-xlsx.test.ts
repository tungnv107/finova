import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const mocks = vi.hoisted(() => ({ overview: vi.fn(), loadTransactionExport: vi.fn() }));
vi.mock("@/server/reporting", () => ({ overview: mocks.overview }));
vi.mock("@/server/csv-export", () => ({
  loadTransactionExport: mocks.loadTransactionExport,
  exportHeaders: ["ID", "Ngày giờ ISO", "Loại", "Ví nguồn", "Ví đích", "Danh mục", "Số tiền VND", "Thu nhập VND", "Chi phí ròng VND", "Ghi chú"],
}));

import { reportXlsx } from "@/server/file-exports";

describe("XLSX export scope and financial precision", () => {
  beforeEach(() => {
    mocks.overview.mockReset().mockResolvedValue({
      period: { start: "2026-10-01", endExclusive: "2026-11-01", actualEndExclusive: "2026-10-22" },
      filters: { walletId: "wallet-a", categoryId: null },
      kpis: { income: "9007199254740993", expense: "50000", surplus: "9007199254690993", available: "200000" },
      series: [{ date: "2026-10-20", income: "9007199254740993", expense: "50000", surplus: "9007199254690993" }],
      categories: [{ name: "Ăn uống", amount: "50000" }],
    });
    mocks.loadTransactionExport.mockReset().mockResolvedValue({
      period: { start: "2026-10-01", endExclusive: "2026-11-01" },
      records: [["t1", "2026-10-20T03:00:00.000Z", "EXPENSE", "Ví", "", "Ăn uống", "50000", "0", "50000", "Bữa trưa"]],
    });
  });

  it("passes the ledger actual cutoff to detail export, preserving filters and VND > MAX_SAFE_INTEGER", async () => {
    const file = await reportXlsx("workspace-a", { start: "2026-10-01", endExclusive: "2026-11-01", walletId: "wallet-a" });
    expect(mocks.overview).toHaveBeenCalledWith("workspace-a", expect.objectContaining({ walletId: "wallet-a" }));
    expect(mocks.loadTransactionExport).toHaveBeenCalledWith("workspace-a", expect.objectContaining({ walletId: "wallet-a" }), new Date("2026-10-21T17:00:00.000Z"));
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file as unknown as Parameters<typeof book.xlsx.load>[0]);
    const overview = book.getWorksheet("Tổng quan")!;
    const summary = new Map(overview.getRows(2, overview.rowCount - 1)!.map(r => [r.getCell(1).value, r.getCell(2).value]));
    expect(summary.get("Dữ liệu thực tế đến trước")).toBe("2026-10-22");
    expect(summary.get("Lọc ví")).toBe("wallet-a");
    expect(summary.get("Thu nhập")).toBe("9007199254740993");
    expect(book.getWorksheet("Thu chi")!.getCell("B2").value).toBe("9007199254740993");
    expect(book.getWorksheet("Giao dịch chi tiết")!.rowCount).toBe(2);
    expect(summary.get("Phạm vi chi tiết")).toContain("KPI từ sổ cái");
  });

  it("exports an empty transaction detail sheet without inventing rows", async () => {
    mocks.loadTransactionExport.mockResolvedValueOnce({ period: { start: "2026-10-01", endExclusive: "2026-11-01" }, records: [] });
    const file = await reportXlsx("workspace-a");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file as unknown as Parameters<typeof book.xlsx.load>[0]);
    expect(book.getWorksheet("Giao dịch chi tiết")!.rowCount).toBe(1);
    expect(book.getWorksheet("Theo danh mục")!.getCell("B2").value).toBe(50000);
  });
});
