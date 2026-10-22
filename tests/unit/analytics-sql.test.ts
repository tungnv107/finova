import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@finova/prisma";
import { expenseHeatmap, historicalTrends } from "@/server/analytics";

const mocked = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  walletCount: vi.fn(),
  categoryCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mocked.queryRaw,
    wallet: { count: mocked.walletCount },
    category: { count: mocked.categoryCount },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocked.queryRaw.mockResolvedValue([]);
  mocked.walletCount.mockResolvedValue(1);
  mocked.categoryCount.mockResolvedValue(1);
});

function preparedQuery() {
  expect(mocked.queryRaw).toHaveBeenCalledOnce();
  const [strings, ...values] = mocked.queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
  return Prisma.sql(strings, ...values);
}

describe("analytics PostgreSQL queries", () => {
  it("binds missing filters as nullable parameters instead of SQL fragments", async () => {
    const result = await expenseHeatmap("workspace-a", { start: "2026-10-01", endExclusive: "2026-11-01" });
    expect(result.days).toHaveLength(31);

    const query = preparedQuery();
    expect(query.text).toContain('($5::text IS NULL OR j."walletId" = $6::text)');
    expect(query.text).toContain('($7::text IS NULL OR c."id" = $8::text)');
    expect(query.values).toHaveLength(8);
    expect(query.values.slice(-4)).toEqual([null, null, null, null]);
  });

  it("keeps both wallet and category filters parameterized for trends", async () => {
    const result = await historicalTrends("workspace-a", {
      start: "2026-10-01", endExclusive: "2026-11-01", walletId: "wallet-a", categoryId: "category-a",
    }, 12);
    expect(result.months).toHaveLength(12);

    const query = preparedQuery();
    expect(query.text).toContain('($5::text IS NULL OR j."walletId" = $6::text)');
    expect(query.text).toContain('($7::text IS NULL OR c."id" = $8::text)');
    expect(query.values.slice(-4)).toEqual(["wallet-a", "wallet-a", "category-a", "category-a"]);
    expect(mocked.walletCount).toHaveBeenCalledWith({ where: { workspaceId: "workspace-a", id: "wallet-a" } });
    expect(mocked.categoryCount).toHaveBeenCalledWith({ where: { workspaceId: "workspace-a", id: "category-a" } });
  });
});
