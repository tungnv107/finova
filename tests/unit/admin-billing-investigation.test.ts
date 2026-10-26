import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderCount: vi.fn(), orderFind: vi.fn(), auditCount: vi.fn(), auditFind: vi.fn(),
}));
vi.mock("../../src/lib/db", () => ({ prisma: {
  billingOrder: { count: mocks.orderCount, findMany: mocks.orderFind },
  adminAuditLog: { count: mocks.auditCount, findMany: mocks.auditFind },
} }));

import { listBillingOrdersForOperations, listSensitiveAdminAudit,
  parseBillingOrderFilter, parseSensitiveAuditAction } from "../../src/modules/admin/billing-investigation";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.orderCount.mockResolvedValue(1);
  mocks.auditCount.mockResolvedValue(1);
  mocks.orderFind.mockResolvedValue([{
    id: "o1", orderCode: "FNV-TEST", createdAt: new Date("2026-10-25"),
    expiresAt: new Date("2026-10-26"), paidAt: null, activatedAt: null,
    status: "PENDING_PAYMENT", billingPeriodSnapshot: "MONTH",
    amountDueVnd: BigInt(29000), receiver: { bankCode: "TEST", accountNumberLast4: "4321" },
  }]);
  mocks.auditFind.mockResolvedValue([{
    id: "a1", action: "RECEIVER_APPROVE", resourceType: "BillingReceivingAccount",
    createdAt: new Date("2026-10-25"),
  }]);
});

describe("admin billing investigation projections", () => {
  it("only accepts known billing statuses and projects masked receiver without raw account", async () => {
    expect(parseBillingOrderFilter("REVIEW")).toBe("REVIEW");
    expect(parseBillingOrderFilter("DELETED")).toBeUndefined();
    const result = await listBillingOrdersForOperations({ page: 2, status: "REVIEW" });
    expect(result.orders[0].receiver).toBe("TEST · ••••4321");
    expect(result.orders[0].amountDueVnd).toBe("29000");
    expect(result.pageSize).toBe(25);
    expect(mocks.orderFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "REVIEW" }, skip: 50, take: 25,
      select: expect.not.objectContaining({ user: true, accountNumberEncrypted: true, userId: true }),
    }));
    expect(JSON.stringify(result)).not.toMatch(/email|accountNumberEncrypted|beforeJson|afterJson/);
  });

  it("enforces the sensitive action allowlist at service boundary", async () => {
    expect(parseSensitiveAuditAction("USER_ACCESS_CHANGE")).toBe("USER_ACCESS_CHANGE");
    expect(parseSensitiveAuditAction("LOGIN")).toBeUndefined();
    const result = await listSensitiveAdminAudit({ page: 1, action: "LOGIN" });
    expect(result.pageSize).toBe(25);
    expect(mocks.auditFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { action: { in: expect.arrayContaining(["RECEIVER_APPROVE"]) } },
      skip: 25, take: 25,
      select: { id: true, action: true, resourceType: true, createdAt: true },
    }));
    expect(JSON.stringify(result)).not.toMatch(/actorId|reason|beforeJson|afterJson|ipAddress/);
    await listSensitiveAdminAudit({ page: 0, action: "RECEIVER_APPROVE" });
    expect(mocks.auditFind).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { action: { equals: "RECEIVER_APPROVE" } },
    }));
  });
});
