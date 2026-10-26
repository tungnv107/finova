import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { role, count, findMany } = vi.hoisted(() => ({
  role: vi.fn(), count: vi.fn(), findMany: vi.fn(),
}));
vi.mock("../../src/server/system-auth", () => ({ requireSystemRole: role }));
vi.mock("../../src/lib/db", () => ({ prisma: {
  billingOutbox: { count, findMany },
} }));

import { HttpError } from "../../src/server/context";
import { GET } from "../../src/app/api/v1/admin/billing/notices/route";

function request(page?: string) {
  return new NextRequest(`https://finova.test/api/v1/admin/billing/notices${page ? `?page=${page}` : ""}`);
}

beforeEach(() => {
  role.mockReset().mockResolvedValue({ userId: "finance", role: "FINANCE_OPERATOR" });
  count.mockReset().mockResolvedValue(1);
  findMany.mockReset().mockResolvedValue([
    { id: "event", orderId: "order", kind: "PREMIUM_ACTIVATED",
      attemptCount: 6, lastErrorCode: "NOTICE_LEASE_EXHAUSTED", createdAt: new Date(), nextAttemptAt: new Date() },
  ]);
});

describe("admin billing notification DLQ list", () => {
  it("checks signed admin role before querying billing records", async () => {
    role.mockRejectedValue(new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Forbidden"));
    expect((await GET(request())).status).toBe(403);
    expect(count).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("paginates only dead letters and projects safe operational fields", async () => {
    const response = await GET(request("2"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.events).toHaveLength(1);
    expect(role).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"], expect.any(NextRequest));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "PENDING", deadLetteredAt: { not: null } },
      skip: 60, take: 30,
      select: {
        id: true, orderId: true, kind: true, attemptCount: true,
        lastErrorCode: true, createdAt: true, nextAttemptAt: true,
      },
    }));
  });

  it("bounds invalid and excessive pagination", async () => {
    await GET(request("not-a-number"));
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }));
    await GET(request("999999999"));
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 3000 }));
  });
});
