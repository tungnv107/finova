import { beforeEach, describe, expect, it, vi } from "vitest";

const ordersFindMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { billingOrder: { findMany: ordersFindMany } } }));

import { listBillingOrders } from "../../src/modules/billing/service";

beforeEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("owner-scoped order history", () => {
  it("exposes verified paid/activation times and expires only truly pending orders", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T08:00:00Z"));
    const base = {
      id: "order", orderCode: "FNV-1", amountDueVnd: "29000", billingPeriodSnapshot: "MONTH",
      createdAt: new Date("2026-10-24T08:00:00Z"),
      expiresAt: new Date("2026-10-25T08:00:00Z"), paidAt: null, activatedAt: null,
    };
    const paidAt = new Date("2026-10-25T07:00:00Z");
    const activatedAt = new Date("2026-10-25T07:01:00Z");
    ordersFindMany.mockResolvedValue([
      { ...base, id: "expired", status: "PENDING_PAYMENT" },
      { ...base, id: "paid", status: "PAID", paidAt },
      { ...base, id: "refunded", status: "REFUNDED", paidAt, activatedAt },
      { ...base, id: "review", status: "REVIEW" },
    ]);
    try {
      const rows = await listBillingOrders("owner-lite");
      expect(ordersFindMany).toHaveBeenCalledWith({ where: { userId: "owner-lite" }, take: 30,
        orderBy: { createdAt: "desc" } });
      expect(rows.map(row => row.status)).toEqual(["EXPIRED", "PAID", "REFUNDED", "REVIEW"]);
      expect(rows[1]).toMatchObject({ amountVnd: 29000, paidAt, activatedAt: null });
      expect(rows[2]).toMatchObject({ paidAt, activatedAt });
      expect(rows[0].paidAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
