import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { Prisma } from "@finova/prisma";
import { MAX_AI_STATEMENT_TEXT_LENGTH } from "@/lib/ai-statement-limits";
import { previewAiStatement, statementContent, statementIdentity } from "@/server/ai/statements";
const mocks = vi.hoisted(() => ({ walletCount: vi.fn(), schemaCheck: vi.fn(), categories: vi.fn(), history: vi.fn(), prior: vi.fn(), transaction: vi.fn(), ai: vi.fn(), getImport: vi.fn(), premium: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { wallet: { count: mocks.walletCount }, category: { findMany: mocks.categories }, transaction: { findMany: mocks.history }, importRow: { findFirst: mocks.schemaCheck, findMany: mocks.prior }, $transaction: mocks.transaction } }));
vi.mock("@/server/ai/provider", () => ({ aiJson: mocks.ai }));
vi.mock("@/server/imports", () => ({ getImport: mocks.getImport }));
vi.mock("@/server/premium", () => ({ requireWorkspacePremiumInDb: mocks.premium }));
const context = { userId: "u", workspaceId: "ws", name: "test", image: null };
const row = { date: "2026-01-02", amount: "50000", kind: "EXPENSE", note: "Dinner", reference: "ref1", categoryId: "c", confidence: 0.99, categoryConfidence: 0.99, reason: "Food" };
const png = () => new File([Buffer.from("89504e470d0a1a0a0000", "hex")], "test.png");
beforeEach(() => {
  vi.resetAllMocks(); mocks.walletCount.mockResolvedValue(1); mocks.schemaCheck.mockResolvedValue(null); mocks.categories.mockResolvedValue([{ id: "c", name: "Ăn uống", kind: "EXPENSE" }]); mocks.history.mockResolvedValue([]); mocks.prior.mockResolvedValue([]);
  mocks.ai.mockResolvedValue({ currency: "VND", complete: true, warnings: [], rows: [row] }); mocks.getImport.mockResolvedValue({ id: "batch" });
});
describe("P0 statement formats", () => {
  it("sends pasted Vietnamese text as complete text, preserving rows and columns", async () => {
    const text = "Ngày\tChi (VND)\tNội dung\n02/01/2026\t50.000\tĂn trưa\n02/01/2026\t50.000\tĂn trưa";
    const result = await statementContent(text);
    expect(result.content).toEqual({ type: "input_text", text: JSON.stringify({ statementText: text }) });
    expect((await statementContent(`\n${text.replaceAll("\n", "\r\n")}\n`)).fileHash).toBe(result.fileHash);
    expect((await statementContent(text + "\n03/01/2026\t20.000\tCà phê")).fileHash).not.toBe(result.fileHash);
  });
  it("rejects empty or oversized text without truncating it", async () => {
    await expect(statementContent(" \r\n\t ")).rejects.toMatchObject({ code: "EMPTY_STATEMENT" });
    await expect(statementContent("a".repeat(MAX_AI_STATEMENT_TEXT_LENGTH + 1))).rejects.toMatchObject({ status: 413 });
    const text = "a\nb".repeat(MAX_AI_STATEMENT_TEXT_LENGTH / 3);
    expect((await statementContent(text.replaceAll("\n", "\r\n"))).content).toEqual({ type: "input_text", text: JSON.stringify({ statementText: text }) });
  });
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
  it.each(["P2021", "P2022"])("reports an unapplied AI migration (%s) before calling the provider", async code => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mocks.schemaCheck.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("PRIVATE_DATABASE_DETAILS", { code, clientVersion: "6.19.3" }));
      const error = await previewAiStatement(context, "Chi 50.000 VND", "wallet").catch(e => e);
      expect(error).toMatchObject({ status: 503, code: "AI_IMPORT_MIGRATION_REQUIRED" });
      expect(error.message).toContain("20261029090000_ai_statement_review");
      expect(error.message).not.toContain("PRIVATE_DATABASE_DETAILS");
      expect(JSON.stringify(warning.mock.calls)).not.toContain("PRIVATE_DATABASE_DETAILS");
      expect(mocks.ai).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
    } finally { warning.mockRestore(); }
  });
  it("does not disguise other database failures as a missing migration", async () => {
    const error = new Error("connection unavailable");
    mocks.schemaCheck.mockRejectedValue(error);
    await expect(previewAiStatement(context, "Chi 50.000 VND", "wallet")).rejects.toBe(error);
    expect(mocks.ai).not.toHaveBeenCalled();
  });
  it("stages pasted text through the same review and duplicate checks as files", async () => {
    const create = vi.fn().mockResolvedValue({ id: "batch" }), createMany = vi.fn();
    mocks.transaction.mockImplementation(async fn => fn({ $executeRaw: vi.fn(), importBatch: { findFirst: vi.fn().mockResolvedValue(null), create }, importRow: { createMany } }));
    mocks.prior.mockResolvedValue([{ sourceHash: statementIdentity("wallet", row) }]);
    const text = "02/01/2026 | Chi 50.000 VND | Dinner | ref1";
    await previewAiStatement(context, text, "wallet");
    expect(mocks.ai.mock.calls[0][2][1]).toEqual({ type: "input_text", text: JSON.stringify({ statementText: text }) });
    expect(create.mock.calls[0][0].data.fileName).toBe("Sao kê từ văn bản");
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ status: "DUPLICATE", walletId: "wallet", amount: "50000" });
    expect(mocks.premium).toHaveBeenCalled();
  });
  it("rejects oversized text before invoking AI or staging rows", async () => {
    await expect(previewAiStatement(context, "a".repeat(MAX_AI_STATEMENT_TEXT_LENGTH + 1), "wallet")).rejects.toMatchObject({ status: 413 });
    expect(mocks.ai).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
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
