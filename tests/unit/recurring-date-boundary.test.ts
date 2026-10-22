import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateOccurrences, processOccurrence, updateRule } from "@/server/recurring";

const mocked = vi.hoisted(() => ({
  ruleFind: vi.fn(), ruleUpdate: vi.fn(), occurrenceDelete: vi.fn(),
  occurrenceFind: vi.fn(), occurrenceClaim: vi.fn(), auditCreate: vi.fn(),
  createTransaction: vi.fn(), ruleList: vi.fn(), occurrenceCreateMany: vi.fn(),
}));
const db = {
  recurringRule: { findFirst: mocked.ruleFind, update: mocked.ruleUpdate },
  recurringOccurrence: { findFirst: mocked.occurrenceFind, updateMany: mocked.occurrenceClaim, deleteMany: mocked.occurrenceDelete, createMany: mocked.occurrenceCreateMany },
  auditLog: { create: mocked.auditCreate },
};
vi.mock("@/lib/db", () => ({ prisma: { recurringRule: { findMany: mocked.ruleList } } }));
vi.mock("@/server/serializable", () => ({ serializable: (work: (transaction: Record<string, unknown>) => Promise<unknown>) => work(db) }));
vi.mock("@/server/ledger", () => ({ createTransactionInDb: mocked.createTransaction }));

const context = { workspaceId: "workspace-a", userId: "user-a", name: "A", image: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocked.ruleFind.mockResolvedValue({ startDate: "2026-10-01" });
  mocked.ruleUpdate.mockResolvedValue({ id: "rule-a" });
  mocked.occurrenceDelete.mockResolvedValue({ count: 3 });
  mocked.auditCreate.mockResolvedValue({ id: "audit" });
});

describe("recurring schedule date integrity", () => {
  it("removes only unposted forecasts past a shortened end date in the same transaction", async () => {
    await updateRule(context, "rule-a", { endDate: "2026-10-15" });
    expect(mocked.ruleUpdate).toHaveBeenCalledWith({ where: { id: "rule-a", workspaceId: "workspace-a" }, data: { endDate: "2026-10-15" } });
    expect(mocked.occurrenceDelete).toHaveBeenCalledWith({ where: {
      workspaceId: "workspace-a", ruleId: "rule-a", periodKey: { gt: "2026-10-15" },
      status: { in: ["PENDING", "PROCESSING"] }, transactionId: null,
    } });
    expect(mocked.auditCreate).toHaveBeenCalledOnce();
  });

  it("keeps pending periods when extending the rule or changing its name", async () => {
    await updateRule(context, "rule-a", { endDate: null });
    await updateRule(context, "rule-a", { name: "New name" });
    expect(mocked.occurrenceDelete).not.toHaveBeenCalled();
  });

  it("updates name and end date together within the owned workspace", async () => {
    await updateRule(context, "rule-a", { name: "Tiền điện", endDate: "2026-10-20" });
    expect(mocked.ruleFind).toHaveBeenCalledWith({ where: { id: "rule-a", workspaceId: "workspace-a" } });
    expect(mocked.ruleUpdate).toHaveBeenCalledWith({
      where: { id: "rule-a", workspaceId: "workspace-a" },
      data: { name: "Tiền điện", endDate: "2026-10-20" },
    });
    expect(mocked.occurrenceDelete).toHaveBeenCalledWith({ where: expect.objectContaining({
      workspaceId: "workspace-a", ruleId: "rule-a", periodKey: { gt: "2026-10-20" },
      status: { in: ["PENDING", "PROCESSING"] }, transactionId: null,
    }) });
    expect(mocked.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      workspaceId: "workspace-a", actorId: "user-a", entityId: "rule-a",
    }) });
  });

  it("rejects foreign rules and invalid date ranges without changing forecasts", async () => {
    mocked.ruleFind.mockResolvedValueOnce(null);
    await expect(updateRule(context, "foreign-rule", { name: "Changed" })).rejects.toMatchObject({ status: 404 });
    await expect(updateRule(context, "rule-a", { endDate: "2026-09-30" })).rejects.toMatchObject({
      status: 400, code: "DATE_RANGE",
    });
    expect(mocked.ruleUpdate).not.toHaveBeenCalled();
    expect(mocked.occurrenceDelete).not.toHaveBeenCalled();
    expect(mocked.auditCreate).not.toHaveBeenCalled();
  });

  it("blocks stale occurrences outside a rule's date range before any ledger or claim mutation", async () => {
    mocked.occurrenceFind.mockResolvedValue({
      id: "occurrence-a", workspaceId: "workspace-a", status: "PENDING",
      periodKey: "2026-10-20", dueAt: new Date("2026-10-19T17:00:00Z"),
      rule: { startDate: "2026-10-01", endDate: "2026-10-15", mode: "AUTO", paused: false },
    });
    await expect(processOccurrence(context, "occurrence-a", new Date("2026-10-20T12:00:00Z")))
      .rejects.toMatchObject({ status: 409, code: "RULE_DATE_RANGE" });
    expect(mocked.occurrenceClaim).not.toHaveBeenCalled();
    expect(mocked.createTransaction).not.toHaveBeenCalled();
    expect(mocked.auditCreate).not.toHaveBeenCalled();
  });

  it("preserves previously posted history even when the end date changes", async () => {
    mocked.occurrenceFind.mockResolvedValue({
      status: "POSTED", transactionId: "transaction-a", periodKey: "2026-10-20",
      rule: { startDate: "2026-10-01", endDate: "2026-10-15" },
    });
    await expect(processOccurrence(context, "occurrence-a")).resolves.toEqual({
      id: "occurrence-a", status: "POSTED", transactionId: "transaction-a",
    });
    expect(mocked.occurrenceClaim).not.toHaveBeenCalled();
    expect(mocked.createTransaction).not.toHaveBeenCalled();
  });

  it("batches each rule's forecast using the current rule inside a serializable transaction", async () => {
    mocked.ruleList.mockResolvedValue([{ id: "rule-a" }, { id: "rule-b" }]);
    mocked.ruleFind.mockResolvedValueOnce({ id: "rule-a", startDate: "2026-10-01", endDate: "2026-10-03", frequency: "DAILY", interval: 1 })
      .mockResolvedValueOnce({ id: "rule-b", startDate: "2026-10-01", endDate: "2026-10-02", frequency: "DAILY", interval: 1 });
    mocked.occurrenceCreateMany.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 0 });

    await expect(generateOccurrences("workspace-a", new Date("2026-10-20T12:00:00Z")))
      .resolves.toMatchObject({ generated: 3 });
    expect(mocked.ruleList).toHaveBeenCalledWith({ where: { workspaceId: "workspace-a", paused: false }, select: { id: true } });
    expect(mocked.ruleFind).toHaveBeenCalledWith({ where: { id: "rule-a", workspaceId: "workspace-a", paused: false } });
    expect(mocked.occurrenceCreateMany).toHaveBeenCalledTimes(2);
    expect(mocked.occurrenceCreateMany.mock.calls[0][0]).toEqual({
      data: ["2026-10-01", "2026-10-02", "2026-10-03"].map(day => ({
        workspaceId: "workspace-a", ruleId: "rule-a", periodKey: day,
        dueAt: new Date(`${day}T00:00:00+07:00`),
      })),
      skipDuplicates: true,
    });
  });

  it("does not restore stale forecast after a rule is paused or shortened", async () => {
    mocked.ruleList.mockResolvedValue([{ id: "rule-a" }, { id: "rule-b" }]);
    mocked.ruleFind.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "rule-b", startDate: "2026-10-01", endDate: "2026-09-30", frequency: "DAILY", interval: 1,
    });
    await expect(generateOccurrences("workspace-a", new Date("2026-10-20T12:00:00Z")))
      .resolves.toMatchObject({ generated: 0 });
    expect(mocked.occurrenceCreateMany).not.toHaveBeenCalled();
  });
});
