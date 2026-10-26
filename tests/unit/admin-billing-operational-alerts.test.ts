import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  payments: vi.fn(), notices: vi.fn(), orders: vi.fn(), latest: vi.fn(), audit: vi.fn(),
}));
vi.mock("../../src/lib/db", () => ({ prisma: {
  billingPaymentEvent: { count: mock.payments, aggregate: mock.latest },
  billingOutbox: { count: mock.notices },
  billingOrder: { count: mock.orders },
  adminAuditLog: { groupBy: mock.audit },
} }));

import { classifyBillingOperationalSignals, getBillingOperationalAlerts } from "../../src/modules/admin/billing-operational-alerts";

const now = new Date("2026-10-25T06:00:00.000Z");
const empty = {
  paymentDeadLetters: 0, noticeDeadLetters: 0, stalledPayments: 0, delayedNotices: 0,
  unresolvedExceptions: 0, overduePendingOrders: 0, recentPendingOrders: 0,
  latestVerifiedEvent: null, unusualAdminActionGroups: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.payments.mockResolvedValue(0);
  mock.notices.mockResolvedValue(0);
  mock.orders.mockResolvedValue(0);
  mock.latest.mockResolvedValue({ _max: { receivedAt: null } });
  mock.audit.mockResolvedValue([]);
});

describe("Admin billing operational alerts", () => {
  it("does not claim an outage solely because no payment events exist", () => {
    expect(classifyBillingOperationalSignals(empty, now)).toEqual([]);
    const risks = classifyBillingOperationalSignals({ ...empty, recentPendingOrders: 2 }, now);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ code: "IPN_NO_SIGNAL", severity: "info", count: 2 });
    expect(risks[0].explanation).toContain("chưa xác nhận IPN/provider bị gián đoạn");
    expect(classifyBillingOperationalSignals({ ...empty, recentPendingOrders: 2,
      latestVerifiedEvent: new Date(now.getTime() - 2 * 60 * 60_000 + 1) }, now)).toEqual([]);
  });

  it("prioritizes durable payment/notice DLQ, lag, exception, overdue and suspicious audit clusters", () => {
    const alerts = classifyBillingOperationalSignals({
      ...empty, paymentDeadLetters: 3, noticeDeadLetters: 1, stalledPayments: 4,
      delayedNotices: 2, unresolvedExceptions: 7, overduePendingOrders: 5,
      unusualAdminActionGroups: 1,
    }, now);
    expect(alerts.map(item => item.code)).toEqual([
      "PAYMENT_DLQ", "NOTICE_DLQ", "MATCHING_LAG", "NOTICE_LAG",
      "PAYMENT_EXCEPTION", "OVERDUE_ORDER", "ADMIN_AUDIT_BURST",
    ]);
    expect(alerts.slice(0, 2).map(item => item.severity)).toEqual(["critical", "critical"]);
    expect(alerts.every(item => item.href.startsWith("/admin/") && !JSON.stringify(item).includes("userId"))).toBe(true);
  });

  it("queries only aggregate metrics with bounded time filters", async () => {
    mock.payments.mockResolvedValueOnce(2).mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    mock.notices.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    mock.orders.mockResolvedValueOnce(6).mockResolvedValueOnce(7);
    mock.latest.mockResolvedValueOnce({ _max: { receivedAt: new Date("2026-10-25T05:59:00Z") } });
    mock.audit.mockResolvedValueOnce([{ actorId: "private-operator-id", action: "RECEIVER_APPROVE", _count: { _all: 5 } }]);
    const result = await getBillingOperationalAlerts(now);
    expect(result.alerts).toHaveLength(7);
    expect(result.alerts.some(alert => alert.code === "IPN_NO_SIGNAL")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-operator-id");
    expect(mock.payments).toHaveBeenCalledTimes(3);
    expect(mock.notices).toHaveBeenCalledTimes(2);
    expect(mock.orders).toHaveBeenCalledTimes(2);
    expect(mock.audit.mock.calls[0][0].where.createdAt.gte).toEqual(new Date("2026-10-25T05:45:00Z"));
    expect(mock.orders.mock.calls[0][0].where.expiresAt.lt).toEqual(new Date("2026-10-25T05:50:00Z"));
    expect(mock.audit.mock.calls[0][0].having.id._count.gte).toBe(5);
  });

  it("fails closed on a DB read error instead of pretending all signals are healthy", async () => {
    mock.payments.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(getBillingOperationalAlerts(now)).rejects.toThrow("database unavailable");
  });
});
