import { beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "@/lib/money";
import { deleteWallet } from "@/server/ledger";

const mocks = vi.hoisted(() => {
  const db = {
    wallet: { findFirst: vi.fn(), delete: vi.fn() },
    ledgerAccount: { delete: vi.fn() },
    transaction: { count: vi.fn() },
    walletReconciliation: { count: vi.fn() },
    savingsGoal: { count: vi.fn() },
    debtContract: { count: vi.fn() },
    debtPayment: { count: vi.fn() },
    cardEntry: { count: vi.fn() },
    bankAccount: { count: vi.fn() },
    recurringRule: { count: vi.fn() },
    importRow: { count: vi.fn() },
    journal: { findMany: vi.fn(), delete: vi.fn() },
    posting: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db, serializable: vi.fn() };
});

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/serializable", () => ({ serializable: mocks.serializable }));

const context = { userId: "person-a", workspaceId: "space-a", name: "A", image: null };
const opening = {
  id: "opening-a", kind: "OPENING", walletId: "wallet-a", destinationWalletId: null,
  transactionId: null, reversedJournalId: null, reversal: null,
  postings: [
    { ledgerAccountId: "asset-a", side: "DEBIT", amount: new Decimal(100000), account: { code: "WALLET_ABC" } },
    { ledgerAccountId: "equity", side: "CREDIT", amount: new Decimal(100000), account: { code: "EQUITY_OPENING" } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serializable.mockImplementation((work: (db: typeof mocks.db) => unknown) => work(mocks.db));
  mocks.db.wallet.findFirst.mockResolvedValue({ id: "wallet-a", ledgerAccountId: "asset-a" });
  for (const table of ["transaction", "walletReconciliation", "savingsGoal", "debtContract", "debtPayment",
    "cardEntry", "bankAccount", "recurringRule", "importRow"] as const) mocks.db[table].count.mockResolvedValue(0);
  mocks.db.journal.findMany.mockResolvedValue([]);
});

describe("deleting a mistakenly created wallet", () => {
  it("requires an owned wallet and never changes another workspace", async () => {
    mocks.db.wallet.findFirst.mockResolvedValueOnce(null);
    await expect(deleteWallet(context, "foreign-wallet")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(mocks.db.wallet.findFirst).toHaveBeenCalledWith({ where: { id: "foreign-wallet", workspaceId: "space-a" } });
    expect(mocks.db.wallet.delete).not.toHaveBeenCalled();
  });

  it("removes an unused zero-balance wallet and records the actor", async () => {
    await expect(deleteWallet(context, "wallet-a")).resolves.toEqual({ id: "wallet-a" });
    expect(mocks.db.posting.deleteMany).not.toHaveBeenCalled();
    expect(mocks.db.journal.delete).not.toHaveBeenCalled();
    expect(mocks.db.wallet.delete).toHaveBeenCalledWith({ where: { id: "wallet-a", workspaceId: "space-a" } });
    expect(mocks.db.ledgerAccount.delete).toHaveBeenCalledWith({ where: { id: "asset-a", workspaceId: "space-a" } });
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith({ data: {
      workspaceId: "space-a", actorId: "person-a", action: "DELETE", entityType: "WALLET", entityId: "wallet-a",
    } });
  });

  it("removes only the initial balanced opening journal before deleting a wallet", async () => {
    mocks.db.journal.findMany.mockResolvedValueOnce([opening]);
    await deleteWallet(context, "wallet-a");
    expect(mocks.db.posting.deleteMany).toHaveBeenCalledWith({ where: { journalId: "opening-a" } });
    expect(mocks.db.journal.delete).toHaveBeenCalledWith({ where: { id: "opening-a" } });
    expect(mocks.db.posting.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.journal.delete.mock.invocationCallOrder[0]);
    expect(mocks.db.journal.delete.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.wallet.delete.mock.invocationCallOrder[0]);
  });

  it.each(["transaction", "walletReconciliation", "bankAccount", "recurringRule", "importRow"] as const)(
    "rejects a wallet referenced by %s without deleting financial data", async table => {
      mocks.db[table].count.mockResolvedValueOnce(1);
      await expect(deleteWallet(context, "wallet-a")).rejects.toMatchObject({ status: 409, code: "WALLET_IN_USE" });
      expect(mocks.db.journal.delete).not.toHaveBeenCalled();
      expect(mocks.db.wallet.delete).not.toHaveBeenCalled();
    },
  );

  it("rejects additional ledger activity even if wallet has no transaction row", async () => {
    mocks.db.journal.findMany.mockResolvedValueOnce([opening, { ...opening, id: "other-journal" }]);
    await expect(deleteWallet(context, "wallet-a")).rejects.toMatchObject({ status: 409, code: "WALLET_HAS_ACTIVITY" });
    expect(mocks.db.posting.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects an altered opening entry to avoid erasing a non-opening transaction", async () => {
    mocks.db.journal.findMany.mockResolvedValueOnce([{ ...opening, postings: [
      opening.postings[0], { ...opening.postings[1], amount: new Decimal(90000) },
    ] }]);
    await expect(deleteWallet(context, "wallet-a")).rejects.toMatchObject({ status: 409, code: "WALLET_HAS_ACTIVITY" });
    expect(mocks.db.wallet.delete).not.toHaveBeenCalled();
  });
});
