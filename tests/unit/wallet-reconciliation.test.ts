import { beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "@/lib/money";
import { walletReconciliationInput } from "@/schemas/finance";
import { reconcileWallet, listWalletReconciliations } from "@/server/wallet-reconciliation";

const mocks = vi.hoisted(() => {
  const db = {
    wallet: { findFirst: vi.fn() },
    walletReconciliation: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    posting: { groupBy: vi.fn() }, ledgerAccount: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db, post: vi.fn(), serializable: vi.fn() };
});
vi.mock("@/lib/db", () => ({ prisma: {
  wallet: mocks.db.wallet, walletReconciliation: mocks.db.walletReconciliation,
} }));
vi.mock("@/server/ledger", () => ({ post: mocks.post }));
vi.mock("@/server/serializable", () => ({ serializable: mocks.serializable }));

const context = { workspaceId: "space-a", userId: "person-a", name: "A", image: null };
const input = { expectedBalance: "2000000", actualBalance: "1500000", reason: "Kiểm kê tiền mặt", idempotencyKey: "6e6f4f30-25c1-4b64-9f75-e205b33fe666" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serializable.mockImplementation((fn: (db: typeof mocks.db) => unknown) => fn(mocks.db));
  mocks.db.walletReconciliation.findFirst.mockResolvedValue(null);
  mocks.db.walletReconciliation.findMany.mockResolvedValue([]);
  mocks.db.wallet.findFirst.mockResolvedValue({ id: "wallet-a", ledgerAccountId: "asset-a" });
  mocks.db.posting.groupBy.mockResolvedValue([{ side: "DEBIT", _sum: { amount: new Decimal("2000000") } }]);
  mocks.db.ledgerAccount.upsert.mockResolvedValue({ id: "equity-a" });
  mocks.post.mockResolvedValue({ id: "journal-a" });
  mocks.db.walletReconciliation.create.mockImplementation(({ data }: { data: Record<string, string | null> }) => ({
    ...data, id: "recon-a", expectedBalance: new Decimal(data.expectedBalance!),
    actualBalance: new Decimal(data.actualBalance!), delta: new Decimal(data.delta!),
    createdAt: new Date("2026-10-21T09:00:00Z"),
  }));
});

describe("wallet reconciliation", () => {
  it("posts a balanced reduction against equity without income or expense", async () => {
    const result = await reconcileWallet(context, "wallet-a", input);
    expect(result.delta).toBe("-500000");
    expect(mocks.db.posting.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        ledgerAccountId: "asset-a",
        journal: expect.objectContaining({
          workspaceId: "space-a", effectiveAt: { lt: expect.any(Date) },
        }),
      }),
    }));
    expect(mocks.post).toHaveBeenCalledWith(mocks.db, expect.objectContaining({
      workspaceId: "space-a", kind: "RECONCILIATION", walletId: "wallet-a",
      lines: [
        { ledgerAccountId: "equity-a", side: "DEBIT", amount: new Decimal("500000") },
        { ledgerAccountId: "asset-a", side: "CREDIT", amount: new Decimal("500000") },
      ],
    }));
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith({ data: {
      workspaceId: "space-a", actorId: "person-a", action: "RECONCILE", entityType: "WALLET_RECONCILIATION", entityId: "recon-a",
    } });
    expect(mocks.db.walletReconciliation.create.mock.calls[0][0].data.journalId).toBe("journal-a");
  });

  it("posts an increase to the wallet and uses no journal when already balanced", async () => {
    await reconcileWallet(context, "wallet-a", { ...input, actualBalance: "2500000" });
    expect(mocks.post.mock.calls[0][1].lines.map((line: { side: string }) => line.side)).toEqual(["DEBIT", "CREDIT"]);
    expect(mocks.post.mock.calls[0][1].lines[0].ledgerAccountId).toBe("asset-a");
    mocks.post.mockClear();
    const result = await reconcileWallet(context, "wallet-a", { ...input, actualBalance: "2000000" });
    expect(result.delta).toBe("0");
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.db.walletReconciliation.create.mock.lastCall?.[0].data.journalId).toBeNull();
  });

  it("rejects stale snapshots and foreign or archived wallets before posting", async () => {
    await expect(reconcileWallet(context, "wallet-a", { ...input, expectedBalance: "1900000" }))
      .rejects.toMatchObject({ status: 409, code: "STALE_WALLET_BALANCE" });
    mocks.db.wallet.findFirst.mockResolvedValueOnce(null);
    await expect(reconcileWallet(context, "wallet-foreign", input)).rejects.toMatchObject({ status: 404 });
    expect(mocks.db.wallet.findFirst).toHaveBeenCalledWith({ where: { workspaceId: "space-a", id: "wallet-foreign", archivedAt: null } });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("replays the same idempotency key without writing and rejects different payload", async () => {
    mocks.db.walletReconciliation.findFirst.mockResolvedValue({
      id: "recon-a", walletId: "wallet-a", expectedBalance: new Decimal(input.expectedBalance),
      actualBalance: new Decimal(input.actualBalance), delta: new Decimal("-500000"),
      reason: input.reason, idempotencyKey: input.idempotencyKey,
      journalId: "journal-a", createdAt: new Date("2026-10-21T09:00:00Z"),
    });
    const replay = await reconcileWallet(context, "wallet-a", input);
    expect(replay.id).toBe("recon-a");
    expect(mocks.post).not.toHaveBeenCalled();
    await expect(reconcileWallet(context, "wallet-a", { ...input, actualBalance: "1200000" }))
      .rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
  });

  it("validates integer VND, nonnegative actual, reason and UUID", () => {
    for (const invalid of ["-1", "1.2", "01", "10000000000000000"]) {
      expect(walletReconciliationInput.safeParse({ ...input, actualBalance: invalid }).success).toBe(false);
    }
    expect(walletReconciliationInput.safeParse({ ...input, reason: "" }).success).toBe(false);
    expect(walletReconciliationInput.safeParse({ ...input, idempotencyKey: "bad" }).success).toBe(false);
  });

  it("scopes history lookup to the selected workspace and wallet", async () => {
    await listWalletReconciliations("space-a", "wallet-a");
    expect(mocks.db.walletReconciliation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "space-a", walletId: "wallet-a" }, take: 20,
    }));
    mocks.db.wallet.findFirst.mockResolvedValueOnce(null);
    await expect(listWalletReconciliations("space-a", "wallet-foreign")).rejects.toMatchObject({ status: 404 });
  });
});
