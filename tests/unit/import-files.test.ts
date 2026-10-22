import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseImportFile } from "@/lib/import-files";

async function asXlsx(workbook: ExcelJS.Workbook) {
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return new File([buffer], "transactions.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("CSV/XLSX import parser", () => {
  it("reads plain XLSX values including date cells", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Giao dịch");
    sheet.addRow(["date", "amount", "kind", "note"]);
    sheet.addRow([new Date("2026-10-12T00:00:00Z"), 52000, "CHI", "Mua sách"]);
    expect((await parseImportFile(await asXlsx(wb))).rows).toEqual([
      ["date", "amount", "kind", "note"], ["2026-10-12", "52000", "CHI", "Mua sách"],
    ]);
  });

  it("rejects XLSX formula cells even when they have a cached result", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Import");
    sheet.addRow(["date", "amount"]);
    sheet.addRow(["2026-10-12", { formula: "5000+1000", result: 6000 }]);
    await expect(parseImportFile(await asXlsx(wb))).rejects.toThrow(/công thức/);
  });

  it("rejects forged XLSX and invalid CSV UTF-8", async () => {
    await expect(parseImportFile(new File(["fake"], "bank.xlsx"))).rejects.toThrow(/XLSX/);
    await expect(parseImportFile(new File([new Uint8Array([0xff, 0xfe])], "bank.csv"))).rejects.toThrow();
  });
});
