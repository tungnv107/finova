import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  transactions: vi.fn(), cursorExists: vi.fn(), walletNames: vi.fn(), walletExists: vi.fn(), categoryNames: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  transaction: { findMany: db.transactions, count: db.cursorExists },
  wallet: { findMany: db.walletNames, count: db.walletExists }, category: { findMany: db.categoryNames },
} }));

import { listTransactionsPage } from "@/server/ledger";

beforeEach(() => {
  vi.clearAllMocks();
  db.cursorExists.mockResolvedValue(1);
  db.walletExists.mockResolvedValue(1);
  db.walletNames.mockResolvedValue([{ id: "cash", name: "Tiền mặt" }]);
  db.categoryNames.mockResolvedValue([{ id: "food", name: "Ăn uống" }]);
});

describe("transaction cursor and ordering", () => {
  it("filters transfer fee drill-down using scoped positive fee and validates combinations", async () => {
    db.transactions.mockResolvedValue([]);
    await listTransactionsPage("workspace-a", { kind: "TRANSFER", feeOnly: true, walletId: "cash" });
    expect(db.transactions).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: "workspace-a", kind: "TRANSFER", status: "ACTIVE", feeAmount: { gt: 0 }, walletId: "cash", OR: undefined }),
    }));
    await expect(listTransactionsPage("workspace-a", { kind: "EXPENSE", feeOnly: true })).rejects.toMatchObject({ code: "INVALID_FEE_FILTER" });
    await expect(listTransactionsPage("workspace-a", { kind: "TRANSFER", feeOnly: true, categoryId: "food" })).rejects.toMatchObject({ code: "INVALID_FEE_FILTER" });
  });
  it("orders by local transaction timestamp with ID tie-break and keeps cursor scope", async () => {
    const row = (id: string) => ({ id, kind: "EXPENSE", status: "ACTIVE", amount: { toString: () => "10000" }, walletId: "cash",
      destinationWalletId: null, categoryId: "food", originalTransactionId: null,
      occurredAt: new Date("2026-10-20T08:00:00.000Z"), note: null, version: 1 });
    db.transactions.mockResolvedValue([row("tx2"), row("tx3"), row("tx4")]);
    const page = await listTransactionsPage("workspace-a", { search: "cafe", sort: "asc", cursor: "tx1", limit: 2 });
    expect(page.items.map(t => t.id)).toEqual(["tx2", "tx3"]);
    expect(page.nextCursor).toBe("tx3");
    expect(db.cursorExists).toHaveBeenCalledWith({ where: expect.objectContaining({ workspaceId: "workspace-a", status: "ACTIVE", note: { contains: "cafe", mode: "insensitive" }, id: "tx1" }) });
    expect(db.transactions).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: "workspace-a" }),
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      cursor: { id: "tx1" }, skip: 1, take: 3,
    }));
  });

  it("rejects a cursor outside the current search, without loading another page", async () => {
    db.cursorExists.mockResolvedValue(0);
    await expect(listTransactionsPage("workspace-a", { cursor: "foreign-id", search: "food" })).rejects.toMatchObject({ status: 400, code: "INVALID_CURSOR" });
    expect(db.transactions).not.toHaveBeenCalled();
  });
});
