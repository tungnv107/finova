import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { transaction: { findFirst: mocked.findFirst } } }));

import { transactionDetail } from "@/server/transaction-detail";

beforeEach(() => vi.clearAllMocks());

describe("transaction detail deep-link", () => {
  it("does not query the database for malformed identifiers", async () => {
    expect(await transactionDetail("owner", "../foreign")).toBeNull();
    expect(await transactionDetail("owner", "x".repeat(129))).toBeNull();
    expect(mocked.findFirst).not.toHaveBeenCalled();
  });

  it("hides missing, inactive and foreign transactions using one scoped read", async () => {
    mocked.findFirst.mockResolvedValue(null);
    expect(await transactionDetail("owner", "foreign-id")).toBeNull();
    expect(mocked.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "owner", id: "foreign-id", status: "ACTIVE" },
    }));
    expect(mocked.findFirst.mock.calls[0][0].include).toMatchObject({
      wallet: { select: { name: true } }, category: { select: { name: true } },
    });
  });

  it("resolves a transaction directly without the current date filter or cursor", async () => {
    mocked.findFirst.mockResolvedValue({
      id: "old-id", kind: "EXPENSE", amount: { toString: () => "12345678901234567" }, feeAmount: { toString: () => "0" },
      walletId: "wallet-one", wallet: { name: "Tiền mặt" }, destinationWalletId: null, destinationWallet: null,
      categoryId: "food", category: { name: "Ăn uống" }, originalTransactionId: null,
      occurredAt: new Date("2024-01-01T00:00:00.000Z"), note: "Bữa trưa", version: 2,
    });
    const result = await transactionDetail("owner", "old-id");
    expect(result).toMatchObject({ id: "old-id", amount: "12345678901234567", walletName: "Tiền mặt", categoryName: "Ăn uống", version: 2 });
    expect(mocked.findFirst.mock.calls[0][0].where).toEqual({ workspaceId: "owner", id: "old-id", status: "ACTIVE" });
  });
});
