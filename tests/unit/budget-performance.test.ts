import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@finova/prisma";
import { listBudgetPerformance } from "@/server/budgets";

const db = vi.hoisted(() => ({
  transaction: vi.fn(), budgets: vi.fn(), totals: vi.fn(), insertAlerts: vi.fn(), updateAlerts: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: db.transaction } }));

const period = { startAt: new Date("2026-10-01T00:00:00+07:00"), endAt: new Date("2026-11-01T00:00:00+07:00") };
function budget(id: string, scope: "TOTAL" | "CATEGORY" | "GROUP", categoryIds: string[], limit: string, archived = false) {
  return {
    id, workspaceId: "ws-a", name: id, scope, period: "MONTHLY", currency: "VND", ...period,
    limitAmount: new Prisma.Decimal(limit), archivedAt: archived ? new Date() : null,
    categories: categoryIds.map(categoryId => ({ categoryId, category: { id: categoryId, name: categoryId, color: "#ffffff", kind: "EXPENSE" } })),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    budget: { findMany: db.budgets }, $queryRaw: db.totals,
    budgetAlert: { createMany: db.insertAlerts, updateMany: db.updateAlerts },
  }));
  db.insertAlerts.mockResolvedValue({ count: 0 });
  db.updateAlerts.mockResolvedValue({ count: 0 });
});

describe("Budget reporting and persisted alerts", () => {
  it("does not query postings or mutate alerts when no budgets exist", async () => {
    db.budgets.mockResolvedValue([]);
    expect(await listBudgetPerformance("ws-a")).toEqual([]);
    expect(db.totals).not.toHaveBeenCalled();
    expect(db.insertAlerts).not.toHaveBeenCalled();
    expect(db.updateAlerts).not.toHaveBeenCalled();
  });

  it("uses exact PostgreSQL NUMERIC totals for independent TOTAL/CATEGORY views and skips archived alerts", async () => {
    db.budgets.mockResolvedValue([
      budget("all", "TOTAL", [], "200"), budget("food", "CATEGORY", ["c1"], "100"),
      budget("archived", "GROUP", ["c2", "c3"], "50", true), budget("empty", "CATEGORY", ["c4"], "100"),
    ]);
    db.totals.mockResolvedValue([
      { budgetId: "all", used: new Prisma.Decimal("170.0000") },
      { budgetId: "food", used: new Prisma.Decimal("120.0000") },
      { budgetId: "archived", used: new Prisma.Decimal("100") },
    ]);
    const result = await listBudgetPerformance("ws-a", true);
    expect(result.map(x => [x.id, x.used, x.percent, x.thresholds])).toEqual([
      ["all", "170", "85", ["P50", "P80"]],
      ["food", "120", "120", ["P50", "P80", "P100", "OVER100"]],
      ["archived", "100", "200", ["P50", "P80", "P100", "OVER100"]],
      ["empty", "0", "0", []],
    ]);
    const inserted = db.insertAlerts.mock.calls[0][0].data;
    expect(inserted).toHaveLength(6);
    expect(inserted.every((key: { budgetId: string }) => key.budgetId !== "archived")).toBe(true);
    expect(db.insertAlerts.mock.calls[0][0].skipDuplicates).toBe(true);
    const sql: Prisma.Sql = db.totals.mock.calls[0][0];
    expect(sql.strings.join(" ")).toContain('"BudgetCategory"');
    expect(sql.strings.join(" ")).toContain('"workspaceId"');
    expect(sql.values).toContain("ws-a");
    expect(sql.values).toContain("empty");
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000,
    });
  });

  it("resolves thresholds after a refund and reactivates them without resetting reachedAt", async () => {
    const alertRows = new Map<string, { reachedAt: Date; resolvedAt: Date | null }>();
    db.budgets.mockResolvedValue([budget("food", "CATEGORY", ["c1"], "100")]);
    for (const used of ["110", "60", "115"]) {
      db.totals.mockResolvedValueOnce([{ budgetId: "food", used: new Prisma.Decimal(used) }]);
    }
    db.insertAlerts.mockImplementation(async ({ data }: { data: { budgetId: string; periodKey: string; threshold: string }[] }) => {
      for (const key of data) {
        const rowKey = `${key.budgetId}:${key.periodKey}:${key.threshold}`;
        if (!alertRows.has(rowKey)) alertRows.set(rowKey, { reachedAt: new Date("2026-10-20"), resolvedAt: null });
      }
      return { count: data.length };
    });
    db.updateAlerts.mockImplementation(async ({ where, data }: {
      where: { OR: { budgetId: string; periodKey: string; threshold: string }[]; resolvedAt: null | { not: null } };
      data: { resolvedAt: Date | null };
    }) => {
      for (const key of where.OR) {
        const row = alertRows.get(`${key.budgetId}:${key.periodKey}:${key.threshold}`);
        if (!row) continue;
        if (where.resolvedAt === null && row.resolvedAt === null) row.resolvedAt = data.resolvedAt;
        if (where.resolvedAt !== null && row.resolvedAt !== null) row.resolvedAt = data.resolvedAt;
      }
      return { count: where.OR.length };
    });

    expect((await listBudgetPerformance("ws-a"))[0].thresholds).toHaveLength(4);
    expect(alertRows.size).toBe(4);
    expect((await listBudgetPerformance("ws-a"))[0].thresholds).toEqual(["P50"]);
    expect([...alertRows.values()].filter(row => row.resolvedAt !== null)).toHaveLength(3);
    expect((await listBudgetPerformance("ws-a"))[0].thresholds).toHaveLength(4);
    expect(alertRows.size).toBe(4);
    expect([...alertRows.values()].every(row => row.resolvedAt === null && row.reachedAt.toISOString().startsWith("2026-10-20"))).toBe(true);
  });
});
