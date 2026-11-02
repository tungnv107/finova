import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { transaction: { findMany: db.findMany }, wallet: { count: db.count }, category: { count: db.count } } }));
vi.mock("@/server/context", () => ({ HttpError: class extends Error {} }));
import { loadTransactionExport, transactionsCsv } from "@/server/csv-export";
const filter = { start: "2026-10-01", endExclusive: "2026-11-01" };
beforeEach(() => {
  db.count.mockResolvedValue(1);
  db.findMany.mockResolvedValue([{ id: "transfer", kind: "TRANSFER", walletId: "source", amount: "100000", feeAmount: "3500", occurredAt: new Date("2026-10-15T00:00:00Z"), wallet: { name: "Nguồn" }, destinationWallet: { name: "Nhận" }, category: null, note: "=HYPERLINK(\"bad\")" }]);
});
describe("transaction export transfer fees", () => {
  it.each([undefined, "source", "destination"])("attributes transfer fees to source only (filter %s)", async walletId => {
    const { records } = await loadTransactionExport("workspace", { ...filter, walletId });
    expect(records[0][7]).toBe("0");
    expect(records[0][8]).toBe(walletId === "destination" ? "0" : "3500");
  });
  it("keeps fees numeric and quotes untrusted CSV formulas", async () => {
    const { content } = await transactionsCsv("workspace", filter);
    expect(content).toContain(',100000,0,3500,');
    expect(content).toContain("\"'=HYPERLINK");
  });
});
