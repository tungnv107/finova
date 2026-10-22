import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as overviewGet } from "@/app/api/v1/reports/overview/route";
import { GET as heatmapGet } from "@/app/api/v1/reports/heatmap/route";
import { GET as trendsGet } from "@/app/api/v1/reports/trends/route";
import { GET as transactionGet } from "@/app/api/v1/transactions/route";
import { GET as netWorthGet } from "@/app/api/v1/reports/net-worth/route";
import { GET as budgetsGet } from "@/app/api/v1/reports/budget-performance/route";

const mocked = vi.hoisted(() => ({
  requireContext: vi.fn(), overview: vi.fn(), expenseHeatmap: vi.fn(), historicalTrends: vi.fn(),
  listTransactionsPage: vi.fn(), netWorth: vi.fn(), listBudgetPerformance: vi.fn(),
}));

vi.mock("@/server/context", () => ({
  requireContext: mocked.requireContext,
  HttpError: class HttpError extends Error {
    constructor(public status: number, public code: string, message: string, public retryAfterSeconds?: number) {
      super(message);
    }
  },
}));
vi.mock("@/server/reporting", () => ({ overview: mocked.overview }));
vi.mock("@/server/analytics", () => ({ expenseHeatmap: mocked.expenseHeatmap, historicalTrends: mocked.historicalTrends }));
vi.mock("@/server/ledger", () => ({ listTransactionsPage: mocked.listTransactionsPage }));
vi.mock("@/server/net-worth", () => ({ netWorth: mocked.netWorth }));
vi.mock("@/server/budgets", () => ({ listBudgetPerformance: mocked.listBudgetPerformance }));

const readPaths = [
  ["overview", overviewGet, "reports/overview", mocked.overview],
  ["heatmap", heatmapGet, "reports/heatmap", mocked.expenseHeatmap],
  ["trends", trendsGet, "reports/trends", mocked.historicalTrends],
  ["transactions", transactionGet, "transactions", mocked.listTransactionsPage],
  ["net-worth", netWorthGet, "reports/net-worth", mocked.netWorth],
  ["budget-performance", budgetsGet, "reports/budget-performance", mocked.listBudgetPerformance],
] as const;

function request(path: string) {
  return new NextRequest(`http://localhost:3002/api/v1/${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.requireContext.mockResolvedValue({ userId: "user-a", workspaceId: "workspace-a", name: "A", image: null });
  for (const [, , , service] of readPaths) service.mockResolvedValue({ ok: true });
});

describe("private financial read HTTP boundaries", () => {
  it.each(readPaths)("uses the authenticated workspace for %s", async (_name, handler, path, service) => {
    const response = await handler(request(`${path}?workspaceId=workspace-b`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(service).toHaveBeenCalledOnce();
    expect(service.mock.calls[0][0]).toBe("workspace-a");
  });

  it.each(readPaths)("denies unauthenticated %s before querying financial data", async (_name, handler, path, service) => {
    const { HttpError } = await import("@/server/context");
    mocked.requireContext.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED", "Sign in required"));
    const response = await handler(request(path));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(service).not.toHaveBeenCalled();
  });

  it.each(readPaths)("returns private 404 for foreign-object denial from %s", async (_name, handler, path, service) => {
    const { HttpError } = await import("@/server/context");
    service.mockRejectedValueOnce(new HttpError(404, "NOT_FOUND", "Bản ghi không thuộc workspace."));
    const response = await handler(request(`${path}?walletId=foreign-wallet&categoryId=foreign-category`));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("passes wallet/category filters and ignores a caller-provided workspace on every filtered report", async () => {
    const filter = "?workspaceId=workspace-b&walletId=wallet-a&categoryId=category-a&start=2026-10-01&endExclusive=2026-11-01";
    for (const [path, handler] of [
      ["reports/overview", overviewGet], ["reports/heatmap", heatmapGet],
      ["reports/trends", trendsGet],
    ] as const) {
      const response = await handler(request(path + filter));
      expect(response.status).toBe(200);
    }
    const expectedFilter = { start: "2026-10-01", endExclusive: "2026-11-01", walletId: "wallet-a", categoryId: "category-a" };
    expect(mocked.overview).toHaveBeenCalledWith("workspace-a", expectedFilter);
    expect(mocked.expenseHeatmap).toHaveBeenCalledWith("workspace-a", expectedFilter);
    expect(mocked.historicalTrends).toHaveBeenCalledWith("workspace-a", expectedFilter, 6);
  });

  it("rejects invalid trend months before querying data", async () => {
    const response = await trendsGet(request("reports/trends?months=13"));
    expect(response.status).toBe(400);
    expect(mocked.historicalTrends).not.toHaveBeenCalled();
  });

  it("preserves a private 429 response and Retry-After from the session quota", async () => {
    const { HttpError } = await import("@/server/context");
    mocked.requireContext.mockRejectedValueOnce(new HttpError(429, "RATE_LIMITED", "Slow down", 19));
    const response = await overviewGet(request("reports/overview"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("19");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocked.overview).not.toHaveBeenCalled();
  });

  it("passes transaction search, order and cursor through the scoped API", async () => {
    const response = await transactionGet(request("transactions?search=%20lunch%20&sort=asc&cursor=tx-20&limit=25"));
    expect(response.status).toBe(200);
    expect(mocked.listTransactionsPage).toHaveBeenCalledWith("workspace-a", expect.objectContaining({
      search: "lunch", sort: "asc", cursor: "tx-20", limit: 25,
    }));
  });

  it("rejects invalid transaction ordering and oversized searches", async () => {
    expect((await transactionGet(request("transactions?sort=bad"))).status).toBe(400);
    expect((await transactionGet(request(`transactions?search=${"x".repeat(201)}`))).status).toBe(400);
    expect(mocked.listTransactionsPage).not.toHaveBeenCalled();
  });
});
