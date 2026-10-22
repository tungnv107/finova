import { beforeEach, describe, expect, it, vi } from "vitest";
import { walletCutoff, walletLedgerDetail } from "@/server/wallet-detail";

const db = vi.hoisted(() => ({ wallet: vi.fn(), postings: vi.fn(), count: vi.fn(), balances: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  wallet: { findFirst: db.wallet }, posting: { findMany: db.postings, count: db.count },
} }));
vi.mock("@/server/ledger", () => ({ walletBalances: db.balances }));

const wallet = { id: "wallet-a", ledgerAccountId: "asset-a", workspaceId: "space-a" };
const row = (id: string, side: "DEBIT" | "CREDIT", amount: string) => ({
  id, side, amount, journal: { id: `journal-${id}`, kind: "POSTED", transactionId: `transaction-${id}`, effectiveAt: new Date("2026-10-20T03:00:00Z") },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.wallet.mockResolvedValue(wallet);
  db.balances.mockResolvedValue([{ id: "wallet-a", name: "Tiền mặt", balance: "1250", currency: "VND" }]);
  db.postings.mockResolvedValue([row("credit", "CREDIT", "50"), row("debit", "DEBIT", "100")]);
  db.count.mockResolvedValue(1);
});

describe("wallet ledger history and as-of access", () => {
  it("uses an inclusive Vietnam calendar day, capped at actual now", () => {
    const now = new Date("2026-10-21T10:00:00.000Z");
    expect(walletCutoff("2026-10-20", now).toISOString()).toBe("2026-10-20T17:00:00.000Z");
    expect(walletCutoff("2026-10-21", now)).toEqual(now);
    expect(() => walletCutoff("2026-10-22", now)).toThrow("tương lai");
    expect(() => walletCutoff("2026-02-30", now)).toThrow("Ngày không hợp lệ");
  });
  it("only queries the owned wallet and journal workspace, retaining debit-credit signs", async () => {
    const result = await walletLedgerDetail("space-a", "wallet-a", "2026-10-20");
    expect(db.wallet).toHaveBeenCalledWith({ where: { workspaceId: "space-a", id: "wallet-a" } });
    expect(db.postings.mock.calls[0][0].where).toEqual({
      ledgerAccountId: "asset-a", journal: { workspaceId: "space-a", effectiveAt: { lt: new Date("2026-10-20T17:00:00Z") } },
    });
    expect(result.entries.map(entry => entry.change)).toEqual(["-50", "100"]);
    expect(result.wallet.balance).toBe("1250");
    expect(result.nextCursor).toBeNull();
  });
  it("rejects unknown wallets and cursors outside the same scoped account", async () => {
    db.wallet.mockResolvedValueOnce(null);
    await expect(walletLedgerDetail("space-a", "wallet-b")).rejects.toThrow("Không tìm thấy ví");
    expect(db.postings).not.toHaveBeenCalled();
    db.count.mockResolvedValueOnce(0);
    await expect(walletLedgerDetail("space-a", "wallet-a", undefined, "foreign-posting")).rejects.toThrow("Trang lịch sử");
    expect(db.count.mock.calls[0][0].where.id).toBe("foreign-posting");
  });
  it("returns a stable cursor for the next page without discarding journal entries", async () => {
    db.postings.mockResolvedValueOnce(Array.from({ length: 51 }, (_, i) => row(`entry-${i}`, "DEBIT", "10")));
    const result = await walletLedgerDetail("space-a", "wallet-a");
    expect(result.entries).toHaveLength(50);
    expect(result.nextCursor).toBe("entry-49");
    expect(db.postings.mock.calls[0][0].take).toBe(51);
  });
});
