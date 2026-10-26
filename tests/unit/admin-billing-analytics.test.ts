import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../src/lib/db", () => ({ prisma: { $queryRaw: query } }));

import { getBillingAnalytics } from "../../src/modules/admin/billing-analytics";

beforeEach(() => { query.mockReset().mockResolvedValue([]); });

describe("Premium aggregate analytics", () => {
  it("uses Vietnam-day boundaries, distinct allocation counts and exact VND totals", async () => {
    const day = new Date("2026-10-24T00:00:00Z");
    query.mockReset()
      .mockResolvedValueOnce([{ day, created: BigInt(3), paidCohort: BigInt(2), activated: BigInt(1), monthly: BigInt(2), yearly: BigInt(1), refunded: BigInt(1) }])
      .mockResolvedValueOnce([{ day, paidGrants: BigInt(2), renewals: BigInt(1), expiredUsers: BigInt(1), monthlyGrants: BigInt(1), yearlyGrants: BigInt(1) }])
      .mockResolvedValueOnce([{ day, allocatedCount: BigInt(2), grossVnd: "9007199254740993" }])
      .mockResolvedValueOnce([{ day, verified: BigInt(4), exceptions: BigInt(2), unresolved: BigInt(3), reviewIncomingCount: BigInt(2), reviewIncomingVnd: "9007199254740995" }])
      .mockResolvedValueOnce([{ paidUsers: BigInt(1), firstPaidUsers: BigInt(1), renewingUsers: BigInt(1) }]);
    const result = await getBillingAnalytics(7, new Date("2026-10-24T16:59:59.999Z"));
    expect(result.fromVn).toBe("2026-10-18");
    expect(result.untilVn).toBe("2026-10-24");
    expect(result.rows).toHaveLength(7);
    expect(result.rows[0]).toMatchObject({ day: "2026-10-18", orders: 0, grossVnd: "0" });
    expect(result.rows.at(-1)).toMatchObject({ day: "2026-10-24", orders: 3, activatedFromOrders: 1,
      paidGrants: 2, renewals: 1, grossVnd: "9007199254740993", exceptions: 2,
      monthlyGrants: 1, yearlyGrants: 1, reviewIncomingCount: 2, reviewIncomingVnd: "9007199254740995" });
    expect(result.totals).toMatchObject({ orders: 3, paidFromOrders: 2,
      createdToPaidRate: 2 / 3, createdToActivatedRate: 1 / 3, monthlyOrders: 2, yearlyOrders: 1,
      refundedOrderCohort: 1, allocatedCount: 2, grossVnd: "9007199254740993",
      paidUsers: 1, firstPaidUsers: 1, renewingUsers: 1, monthlyGrants: 1, yearlyGrants: 1,
      reviewIncomingVnd: "9007199254740995" });
    expect(query).toHaveBeenCalledTimes(5);
    for (const [fragments, start, end] of query.mock.calls.slice(0, 4)) {
      expect(fragments.join(" ")).toContain("Asia/Ho_Chi_Minh");
      expect(start).toEqual(new Date("2026-10-17T17:00:00.000Z"));
      expect(end).toEqual(new Date("2026-10-24T17:00:00.000Z"));
    }
    expect(query.mock.calls[4]?.[1]).toEqual(new Date("2026-10-17T17:00:00.000Z"));
    expect(query.mock.calls[4]?.[2]).toEqual(new Date("2026-10-24T17:00:00.000Z"));
  });

  it("returns zero daily counts without inventing refunds or net revenue", async () => {
    const report = await getBillingAnalytics(30, new Date("2026-10-25T05:00:00Z"));
    expect(report.rows).toHaveLength(30);
    expect(report.totals.grossVnd).toBe("0");
    expect(report.totals.refundedOrderCohort).toBe(0);
    expect(report.totals.paidUsers).toBe(0);
    expect(report.totals.reviewIncomingVnd).toBe("0");
    expect(report.totals.createdToPaidRate).toBeNull();
    expect(report).not.toHaveProperty("netRevenueVnd");
    expect(report.rows.every(row => row.orders === 0 && row.allocatedCount === 0)).toBe(true);
  });
});
