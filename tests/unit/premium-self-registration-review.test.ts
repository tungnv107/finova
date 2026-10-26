import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRequest: vi.fn(), findUser: vi.fn(), findLatestGrant: vi.fn(), findSubscription: vi.fn(),
  createGrant: vi.fn(), createEvent: vi.fn(), upsertSubscription: vi.fn(), updateRequest: vi.fn(),
  audit: vi.fn(),
}));
const db = vi.hoisted(() => ({
  subscriptionActionRequest: { findUnique: mocks.findRequest, update: mocks.updateRequest },
  user: { findUnique: mocks.findUser },
  subscriptionGrant: { findFirst: mocks.findLatestGrant, create: mocks.createGrant },
  subscription: { findUnique: mocks.findSubscription, upsert: mocks.upsertSubscription },
  subscriptionEvent: { create: mocks.createEvent },
  adminAuditLog: { create: mocks.audit },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/server/serializable", () => ({ serializable: async (run: (tx: typeof db) => Promise<unknown>) => run(db) }));

import { decideSubscriptionAction } from "@/modules/billing/manual-subscriptions";

const reviewer = { userId: "super-admin", role: "SUPER_ADMIN" as const };
const request = () => ({
  id: "registration-1", userId: "member-1", requestedBy: "member-1", kind: "MANUAL_GRANT",
  billingPeriod: "MONTH", periodCount: 1, grantId: null,
  reason: "Người dùng đăng ký Premium; chờ quản trị xác minh.", status: "PENDING",
  expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
  reviewedBy: null,
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.findRequest.mockImplementation(async () => request());
  mocks.findUser.mockResolvedValue({ id: "member-1", accessState: { status: "ACTIVE" }, systemRoles: [] });
  mocks.findLatestGrant.mockResolvedValue(null);
  mocks.findSubscription.mockResolvedValue(null);
  mocks.createGrant.mockResolvedValue({ id: "grant-1" });
  mocks.createEvent.mockResolvedValue({});
  mocks.upsertSubscription.mockResolvedValue({});
  mocks.updateRequest.mockResolvedValue({});
  mocks.audit.mockResolvedValue({});
});

describe("independent review of a user-submitted Premium registration", () => {
  it("grants one calendar period only after a different Super Admin approves", async () => {
    const outcome = await decideSubscriptionAction(reviewer, "registration-1", "APPROVE",
      "Đã kiểm tra và xác minh thanh toán ngoài hệ thống.");
    expect(outcome).toEqual({ id: "registration-1", status: "APPROVED" });
    expect(mocks.createGrant).toHaveBeenCalledOnce();
    expect(mocks.createGrant.mock.calls[0][0].data).toMatchObject({
      userId: "member-1", grantType: "MANUAL", billingPeriod: "MONTH", periodCount: 1,
      createdBy: "super-admin",
    });
    expect(mocks.createEvent).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "member-1", kind: "MANUAL_ACTIVATED", actionRequestId: "registration-1",
    }) });
    expect(mocks.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ planCode: "PREMIUM" }),
    }));
    expect(mocks.updateRequest).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "APPROVED", reviewedBy: "super-admin" }),
    }));
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "SUBSCRIPTION_ACTION_APPROVED", actorId: "super-admin",
    }) });
  });

  it("rejects non-Super-Admin and reviewer who is the registration beneficiary", async () => {
    await expect(decideSubscriptionAction({ userId: "admin", role: "ADMIN" }, "registration-1",
      "APPROVE", "Xin duyệt vì đã kiểm tra thanh toán.")).rejects.toMatchObject({ status: 403 });
    await expect(decideSubscriptionAction({ userId: "member-1", role: "SUPER_ADMIN" }, "registration-1",
      "APPROVE", "Xin duyệt vì đã kiểm tra thanh toán.")).rejects.toMatchObject({
        status: 403, code: "DUAL_APPROVAL_REQUIRED",
      });
    expect(mocks.createGrant).not.toHaveBeenCalled();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("keeps rejected requests as audit records without activating Premium", async () => {
    const result = await decideSubscriptionAction(reviewer, "registration-1", "REJECT",
      "Không xác minh được giao dịch thanh toán tương ứng.");
    expect(result.status).toBe("REJECTED");
    expect(mocks.updateRequest).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REJECTED" }),
    }));
    expect(mocks.createGrant).not.toHaveBeenCalled();
    expect(mocks.createEvent).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
});
