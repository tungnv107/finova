import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { previewAiStatement, statementContent, statementIdentity } from "@/server/ai/statements";
const mocks = vi.hoisted(() => ({ walletCount: vi.fn(), categories: vi.fn(), history: vi.fn(), prior: vi.fn(), transaction: vi.fn(), ai: vi.fn(), getImport: vi.fn(), premium: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { wallet: { count: mocks.walletCount }, category: { findMany: mocks.categories }, transaction: { findMany: mocks.history }, importRow: { findMany: mocks.prior }, $transaction: mocks.transaction } }));
vi.mock("@/server/ai/provider", () => ({ aiJson: mocks.ai }));
vi.mock("@/server/imports", () => ({ getImport: mocks.getImport }));
vi.mock("@/server/premium", () => ({ requireWorkspacePremiumInDb: mocks.premium }));
const context = { userId: "u", workspaceId: "ws", name: "test", image: null };
const row = { date: "2026-01-02", amount: "50000", kind: "EXPENSE", note: "Dinner", reference: "ref1", categoryId: "c", confidence: 0.99, categoryConfidence: 0.99, reason: "Food" };
const png = () => new File([Buffer.from("89504e470d0a1a0a0000", "hex")], "test.png");
beforeEach(() => {
  vi.resetAllMocks(); mocks.walletCount.mockResolvedValue(1); mocks.categories.mockResolvedValue([{ id: "c", name: "Ăn uống", kind: "EXPENSE" }]); mocks.history.mockResolvedValue([]); mocks.prior.mockResolvedValue([]);
  mocks.ai.mockResolvedValue({ currency: "VND", complete: true, warnings: [], rows: [row] }); mocks.getImport.mockResolvedValue({ id: "batch" });
});
describe("P0 statement formats", () => {
  it.each(["pdf", "png", "jpg", "docx", "xls"])("rejects forged %s", async ext => {
    await expect(statementContent(new File(["not a file"], `fake.${ext}`))).rejects.toMatchObject({ status: 415 });
  });
  it("rejects zero-length and oversized uploads", async () => {
    await expect(statementContent(new File([], "a.pdf"))).rejects.toMatchObject({ status: 413 });
    await expect(statementContent(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png"))).rejects.toMatchObject({ status: 413 });
  });
  it("routes raster images as vision content and PDF/Word as files", async () => {
    expect((await statementContent(png())).content.type).toBe("input_image");
    expect((await statementContent(new File(["%PDF-1.4\n"], "a.pdf"))).content.type).toBe("input_file");
    expect((await statementContent(new File([Buffer.from("504b030400000000", "hex")], "a.docx"))).content.type).toBe("input_file");
  });
  it("sends exact XLSX cells without formulas or provider summarization", async () => {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Statement"); sheet.addRow(["Ngày", "Chi", "Nội dung"]); sheet.addRow(["02/01/2026", 50000, "Cà phê"]);
    const file = new File([new Uint8Array(await workbook.xlsx.writeBuffer())], "a.xlsx");
    const result = await statementContent(file); expect(result.content.type).toBe("input_text"); expect(JSON.stringify(result.content)).toContain("50000");
    sheet.getCell("B2").value = { formula: "1+1", result: 2 };
    await expect(statementContent(new File([new Uint8Array(await workbook.xlsx.writeBuffer())], "b.xlsx"))).rejects.toMatchObject({ code: "INVALID_SHEET" });
  });
  it("rejects sheets over the bound rather than truncate", async () => {
    await expect(statementContent(new File(["date,amount\n" + "2026-01-01,1\n".repeat(251)], "a.csv"))).rejects.toMatchObject({ code: "STATEMENT_TOO_LARGE" });
  });
});
describe("P0 staging integrity", () => {
  it("rejects foreign wallets before sending anything to the provider", async () => {
    mocks.walletCount.mockResolvedValue(0); await expect(previewAiStatement(context, png(), "foreign")).rejects.toMatchObject({ code: "INVALID_WALLET" }); expect(mocks.ai).not.toHaveBeenCalled();
  });
  it.each([{ currency: "OTHER", complete: true }, { currency: "UNKNOWN", complete: true }, { currency: "VND", complete: false }])("does not stage incomplete or non-VND responses %j", async flags => {
    mocks.ai.mockResolvedValue({ ...flags, warnings: [], rows: [row] }); await expect(previewAiStatement(context, png(), "wallet")).rejects.toMatchObject({ status: 422 }); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("stages uncertain fields and invalid categories for review, preserves real repeated movements", async () => {
    const createMany = vi.fn(); mocks.transaction.mockImplementation(async fn => fn({ $executeRaw: vi.fn(), importBatch: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "batch" }) }, importRow: { createMany } }));
    mocks.ai.mockResolvedValue({ currency: "VND", complete: true, warnings: [], rows: [row, { ...row, reference: "ref2", confidence: 0.2 }, { ...row, reference: "ref3", categoryId: "foreign" }, { ...row, reference: null }, { ...row, reference: null }] });
    await previewAiStatement(context, png(), "wallet");
    const rows = createMany.mock.calls[0][0].data; expect(rows.map((r: { status: string }) => r.status)).toEqual(["VALID", "INVALID", "INVALID", "VALID", "VALID"]);
    expect(rows[2].categoryId).toBeNull(); expect(rows[3].sourceHash).not.toBe(rows[4].sourceHash); expect(mocks.premium).toHaveBeenCalled();
  });
  it("deduplicates provider references and keeps source identity independent of classification", () => {
    expect(statementIdentity("wallet", row)).toBe(statementIdentity("wallet", { ...row, note: "Different OCR" }));
    expect(statementIdentity("wallet", row)).not.toBe(statementIdentity("wallet2", row));
  });
});
