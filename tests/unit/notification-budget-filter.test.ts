import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileNotifications } from "@/server/notifications";

const db = vi.hoisted(() => ({
  occurrences: vi.fn(), debts: vi.fn(), alerts: vi.fn(), save: vi.fn(), cards: vi.fn(),
  writeGuard: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  recurringOccurrence: { findMany: db.occurrences }, debtContract: { findMany: db.debts },
  budgetAlert: { findMany: db.alerts }, notification: { upsert: db.save },
  $transaction: (work: (client: unknown) => Promise<unknown>) => work({ notification: { upsert: db.save } }),
} }));
vi.mock("@/server/credit-cards", () => ({ listCreditCards: db.cards }));
vi.mock("@/server/premium", () => ({
  requireWorkspacePremium: vi.fn(), requireWorkspacePremiumInDb: db.writeGuard,
}));

beforeEach(() => {
  vi.resetAllMocks();
  db.occurrences.mockResolvedValue([]);
  db.debts.mockResolvedValue([]);
  db.cards.mockResolvedValue([]);
  db.alerts.mockResolvedValue([]);
  db.writeGuard.mockResolvedValue(undefined);
});

describe("Budget notifications", () => {
  it("only considers active, unresolved alerts from the requested workspace", async () => {
    await reconcileNotifications("ws-a", new Date("2026-10-20T00:00:00+07:00"));
    expect(db.alerts).toHaveBeenCalledWith(expect.objectContaining({ where: {
      resolvedAt: null, budget: { workspaceId: "ws-a", archivedAt: null },
    } }));
    expect(db.save).not.toHaveBeenCalled();
  });

  it("uses a meaningful >100% label for an over-budget alert", async () => {
    db.alerts.mockResolvedValue([{ id: "alert", threshold: "OVER100", budget: { name: "Thực phẩm" } }]);
    expect(await reconcileNotifications("ws-a", new Date("2026-10-20T00:00:00+07:00"))).toBe(1);
    expect(db.save).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({
      workspaceId: "ws-a", key: "budget:alert", body: "Thực phẩm: >100%.",
    }) }));
  });

  it("does not persist reminders when Premium expires during calculation", async () => {
    db.alerts.mockResolvedValue([{ id: "alert", threshold: "OVER100", budget: { name: "Thực phẩm" } }]);
    db.writeGuard.mockRejectedValue(new Error("PREMIUM_REQUIRED"));
    await expect(reconcileNotifications("ws-a")).rejects.toThrow("PREMIUM_REQUIRED");
    expect(db.save).not.toHaveBeenCalled();
  });
});
