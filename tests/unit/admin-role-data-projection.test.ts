import { beforeEach, describe, expect, it, vi } from "vitest";

const { orderCount, paidAggregate, userCount, premiumGroupBy, paymentCount, paymentFindMany } = vi.hoisted(() => ({
  orderCount: vi.fn(), paidAggregate: vi.fn(), userCount: vi.fn(), premiumGroupBy: vi.fn(),
  paymentCount: vi.fn(), paymentFindMany: vi.fn(),
}));

vi.mock("../../src/lib/db", () => ({ prisma: {
  billingOrder: { count: orderCount }, paymentAllocation: { aggregate: paidAggregate },
  user: { count: userCount }, subscriptionGrant: { groupBy: premiumGroupBy },
  billingPaymentEvent: { count: paymentCount, findMany: paymentFindMany },
} }));
vi.mock("../../src/modules/admin/usage", () => ({ usageAnalyticsEnabled: () => false }));

import { getAdminOverview } from "../../src/modules/admin/overview";
import { listAdminPayments } from "../../src/modules/admin/payments";

beforeEach(() => {
  orderCount.mockReset().mockResolvedValueOnce(3).mockResolvedValueOnce(10).mockResolvedValueOnce(7);
  paidAggregate.mockReset().mockResolvedValue({ _sum: { amountVnd: BigInt(203000) } });
  userCount.mockReset().mockResolvedValueOnce(22).mockResolvedValueOnce(4);
  premiumGroupBy.mockReset().mockResolvedValue([{ userId: "a" }, { userId: "b" }]);
  paymentCount.mockReset().mockResolvedValue(1);
  paymentFindMany.mockReset().mockResolvedValue([{
    id: "payment-1", provider: "SEPAY", providerTransactionId: "secret-9876",
    reference: "unmatched raw bank memo and personal details", direction: "IN",
    amountVnd: BigInt(29000), verificationStatus: "VERIFIED", matchStatus: "UNMATCHED",
    occurredAt: new Date(), receivedAt: new Date(), attemptCount: 0,
    nextAttemptAt: null, leaseUntil: null, deadLetteredAt: null, lastErrorCode: null,
    allocation: null,
  }]);
});

describe("admin data projection by role", () => {
  it("Finance receives only aggregate billing KPIs, without user/activity fields", async () => {
    const result = await getAdminOverview("FINANCE_OPERATOR");
    expect(result).toEqual({
      scope: "FINANCE", pendingOrders: 3, totalOrders: 10, paidOrders: 7, collectedVnd: 203000,
    });
    expect(userCount).not.toHaveBeenCalled();
    expect(premiumGroupBy).not.toHaveBeenCalled();
  });

  it.each(["ANALYST", "ADMIN", "SUPER_ADMIN"] as const)("%s receives aggregate-only overview", async role => {
    const result = await getAdminOverview(role);
    expect(result).toMatchObject({
      scope: "OVERVIEW", totalUsers: 22, newUsers30d: 4, liteUsers: 20, premiumUsers: 2,
      traffic: { status: "NOT_INSTRUMENTED", visits: null, dau: null, mau: null },
    });
    expect(result).not.toHaveProperty("users");
    expect(result).not.toHaveProperty("emails");
    expect(result).not.toHaveProperty("bankAccounts");
  });

  it("finance payment list exposes masked transaction ID and parsed reference only", async () => {
    const result = await listAdminPayments({ reviewOnly: true });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ transactionMasked: "••••9876", amountVnd: 29000 });
    expect(result.events[0]).not.toHaveProperty("providerTransactionId");
    expect(result.events[0]).not.toHaveProperty("reference");
    expect(result.events[0]).not.toHaveProperty("accountNumber");
    expect(JSON.stringify(result)).not.toContain("unmatched raw bank memo and personal details");
    expect(paymentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { matchStatus: { in: expect.any(Array) } }, take: 30,
    }));
  });
});
