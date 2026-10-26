import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPrior: vi.fn(), findUser: vi.fn(), findPending: vi.fn(), createRequest: vi.fn(), createAudit: vi.fn(),
  listRequests: vi.fn(),
}));
const db = vi.hoisted(() => ({
  subscriptionActionRequest: { findUnique: mocks.findPrior, findFirst: mocks.findPending,
    create: mocks.createRequest, findMany: mocks.listRequests },
  user: { findUnique: mocks.findUser },
  adminAuditLog: { create: mocks.createAudit },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/server/serializable", () => ({ serializable: async (work: (value: typeof db) => Promise<unknown>) => work(db) }));

import { listMyPremiumRegistrations, requestPremiumRegistration } from "@/modules/billing/manual-subscriptions";

const originalFlag = process.env.FINOVA_ADMIN_ENABLED;

beforeEach(() => {
  process.env.FINOVA_ADMIN_ENABLED = "1";
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.findPrior.mockResolvedValue(null);
  mocks.findUser.mockResolvedValue({ id: "member", accessState: null, systemRoles: [] });
  mocks.findPending.mockResolvedValue(null);
  mocks.createRequest.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    ({ id: "request-1", status: "PENDING", ...data }));
  mocks.createAudit.mockResolvedValue({});
});

afterEach(() => {
  if (originalFlag === undefined) delete process.env.FINOVA_ADMIN_ENABLED;
  else process.env.FINOVA_ADMIN_ENABLED = originalFlag;
});

describe("self-service Premium registration", () => {
  it("creates an audited request without a grant or payment event", async () => {
    const result = await requestPremiumRegistration("member", "YEAR", "registration-key-123");
    expect(result).toMatchObject({ id: "request-1", status: "PENDING" });
    const data = mocks.createRequest.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: "member", requestedBy: "member", kind: "MANUAL_GRANT",
      periodCount: 1, billingPeriod: "YEAR" });
    expect(mocks.createAudit).toHaveBeenCalledWith(expect.objectContaining({ data:
      expect.objectContaining({ action: "PREMIUM_REGISTRATION_REQUESTED" }) }));
  });

  it("returns the same request on an idempotent retry", async () => {
    mocks.findPrior.mockResolvedValue({ id: "earlier", status: "PENDING", userId: "member",
      kind: "MANUAL_GRANT", billingPeriod: "MONTH", expiresAt: new Date() });
    await expect(requestPremiumRegistration("member", "MONTH", "registration-key-123"))
      .resolves.toMatchObject({ id: "earlier" });
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it("prevents multiple pending applications and privileged self-grants", async () => {
    mocks.findPending.mockResolvedValue({ id: "pending" });
    await expect(requestPremiumRegistration("member", "YEAR", "registration-key-123"))
      .rejects.toMatchObject({ code: "REGISTRATION_PENDING", status: 409 });
    mocks.findPending.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue({ id: "member", accessState: null, systemRoles: [{ id: "admin-role" }] });
    await expect(requestPremiumRegistration("member", "YEAR", "registration-key-123"))
      .rejects.toMatchObject({ code: "PRIVILEGED_TARGET", status: 403 });
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it("validates the period and refuses registration when the Admin module is disabled", async () => {
    await expect(requestPremiumRegistration("member", "WEEK" as never, "registration-key-123"))
      .rejects.toMatchObject({ code: "INVALID_PERIOD" });
    process.env.FINOVA_ADMIN_ENABLED = "0";
    await expect(requestPremiumRegistration("member", "YEAR", "registration-key-123"))
      .rejects.toMatchObject({ code: "ADMIN_DISABLED" });
  });

  it("lists only the member's own registration requests", async () => {
    mocks.listRequests.mockResolvedValue([]);
    await listMyPremiumRegistrations("member");
    expect(mocks.listRequests).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "member", requestedBy: "member", kind: "MANUAL_GRANT" }, take: 10,
    }));
  });
});
