import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  requirePageContext: vi.fn(), walletBalances: vi.fn(), listTransactionsPage: vi.fn(),
  categoryFindMany: vi.fn(), transactionDetail: vi.fn(), notFound: vi.fn(),
}));

vi.mock("@/server/page-context", () => ({ requirePageContext: mocked.requirePageContext }));
vi.mock("@/server/ledger", () => ({ walletBalances: mocked.walletBalances, listTransactionsPage: mocked.listTransactionsPage }));
vi.mock("@/lib/db", () => ({ prisma: { category: { findMany: mocked.categoryFindMany } } }));
vi.mock("@/server/transaction-detail", () => ({ transactionDetail: mocked.transactionDetail }));
vi.mock("next/navigation", () => ({ notFound: mocked.notFound }));

import TransactionsPage from "@/app/(protected)/transactions/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocked.requirePageContext.mockResolvedValue({ workspaceId: "workspace-a" });
  mocked.walletBalances.mockResolvedValue([]);
  mocked.categoryFindMany.mockResolvedValue([]);
  mocked.listTransactionsPage.mockResolvedValue({ items: [{ id: "page-1", version: 1 }], nextCursor: "page-1" });
  mocked.transactionDetail.mockResolvedValue({ id: "older-transaction", kind: "EXPENSE", amount: "75000" });
  mocked.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
});

describe("transaction page deep-link", () => {
  it("shows the selected transaction independently of the first 50 filtered rows", async () => {
    const element = await TransactionsPage({ searchParams: Promise.resolve({
      transactionId: "older-transaction", start: "2026-10-01", endExclusive: "2026-11-01", kind: "INCOME", search: "cafe", sort: "asc",
    }) });
    expect(mocked.transactionDetail).toHaveBeenCalledWith("workspace-a", "older-transaction");
    expect(mocked.listTransactionsPage).toHaveBeenCalledWith("workspace-a", expect.objectContaining({ kind: "INCOME", search: "cafe", sort: "asc", limit: 50 }));
    expect(element.props.selectedTransaction.id).toBe("older-transaction");
    expect(element.props.rows).toEqual([{ id: "page-1", version: 1 }]);
    expect(element.props.nextCursor).toBe("page-1");
  });

  it("returns 404 for missing, inactive or foreign scoped records", async () => {
    mocked.transactionDetail.mockResolvedValue(null);
    await expect(TransactionsPage({ searchParams: Promise.resolve({ transactionId: "other-user-transaction" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocked.notFound).toHaveBeenCalledOnce();
  });

  it("skips the detail lookup for ordinary transaction lists", async () => {
    const element = await TransactionsPage({ searchParams: Promise.resolve({}) });
    expect(mocked.transactionDetail).not.toHaveBeenCalled();
    expect(element.props.selectedTransaction).toBeNull();
  });
});
