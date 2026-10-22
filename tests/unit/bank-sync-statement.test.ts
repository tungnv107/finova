import { describe, expect, it } from "vitest";
import { bankFingerprint } from "@/modules/bank-sync/domain";
import { readBankStatement, statementEnvelope } from "@/modules/bank-sync/statement";

const mapping = { walletId: "wallet-1", dateColumn: "Date", inflowColumn: "Credit", outflowColumn: "Debit",
  descriptionColumn: "Description", referenceColumn: "Reference", cutoverDay: "2026-10-01" };
const file = (csv: string) => new File([csv], "synthetic-statement.csv", { type: "text/csv" });

describe("bank statement staging", () => {
  it("previews valid and invalid rows without touching the ledger", async () => {
    const parsed = await readBankStatement(file("Date,Credit,Debit,Description,Reference\n2026-10-02,200000,,Lương,ref-1\n2026-10-03,,50000,Cafe,ref-2\n2026-10-04,5,5,Ambiguous,ref-3\n2026-10-05,0,0,Empty,ref-4"), mapping);
    expect(parsed).toMatchObject({ validCount: 2, invalidCount: 2, total: 4 });
    expect(parsed.rows[0].transaction).toMatchObject({ direction: "IN", amount: "200000", bookingStatus: "BOOKED" });
    expect(parsed.rows[1].transaction).toMatchObject({ direction: "OUT", amount: "50000" });
    expect(parsed.rows[2].status).toBe("INVALID");
  });

  it("treats repeated references and formula payloads as invalid", async () => {
    const parsed = await readBankStatement(file("Date,Credit,Debit,Description,Reference\n2026-10-02,200,,Safe,abc\n2026-10-03,,10,Safe,abc\n2026-10-04,,10,=SUM(1),ref"), mapping);
    expect(parsed.invalidCount).toBe(2);
    expect(parsed.rows[1].error).toMatch(/Trùng mã tham chiếu/);
    expect(parsed.rows[2].error).toMatch(/công thức/);
  });

  it("binds a preview token to content AND mapping", async () => {
    const source = file("Date,Credit,Debit,Description,Reference\n2026-10-02,200,,Salary,1");
    const a = await readBankStatement(source, mapping);
    const b = await readBankStatement(source, { ...mapping, cutoverDay: "2026-10-02" });
    expect(a.fileHash).toBe(b.fileHash);
    expect(a.previewToken).not.toBe(b.previewToken);
  });

  it("retains separate event IDs but identical transaction fingerprints across overlapping files", async () => {
    const row = "2026-10-02,200,,Salary,ref-1";
    const a = await readBankStatement(file(`Date,Credit,Debit,Description,Reference\n${row}`), mapping);
    const b = await readBankStatement(file(`Date,Credit,Debit,Description,Reference\n2026-10-01,,10,Other,ref-2\n${row}`), mapping);
    const eventA = statementEnvelope(a.fileHash, mapping.walletId, a.rows[0], "account-ref");
    const eventB = statementEnvelope(b.fileHash, mapping.walletId, b.rows[1], "account-ref");
    expect(eventA.eventId).not.toBe(eventB.eventId);
    expect(bankFingerprint("bank-account", eventA.transactions[0])).toBe(bankFingerprint("bank-account", eventB.transactions[0]));
  });

  it("rejects files without a mapped column or with inconsistent CSV width", async () => {
    await expect(readBankStatement(file("Date,Credit,Debit,Description,Reference\n2026-10-02,200,,Salary,1"), { ...mapping, dateColumn: "Unknown" })).rejects.toThrow();
    await expect(readBankStatement(file("Date,Credit\n2026-10-01,200,extra"), mapping)).rejects.toThrow();
  });
});
