import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, findAccessState, findSystemRoles, limitSystemRequest } = vi.hoisted(() => ({
  getSession: vi.fn(), findAccessState: vi.fn(), findSystemRoles: vi.fn(), limitSystemRequest: vi.fn(),
}));

vi.mock("../../src/server/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("../../src/lib/db", () => ({ prisma: {
  userAccessState: { findUnique: findAccessState },
  systemRoleAssignment: { findMany: findSystemRoles },
} }));
vi.mock("../../src/server/rate-limit", () => ({ limitSystemRequest }));

import { requireSystemRole } from "../../src/server/system-auth";

const priorFlag = process.env.FINOVA_ADMIN_ENABLED;
const request = () => new NextRequest("https://finova.example.test/api/v1/admin/overview");
const roles = ["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR", "ANALYST"] as const;

beforeEach(() => {
  process.env.FINOVA_ADMIN_ENABLED = "1";
  getSession.mockReset().mockResolvedValue({ user: { id: "user-a" } });
  findAccessState.mockReset().mockResolvedValue(null);
  findSystemRoles.mockReset().mockResolvedValue([]);
  limitSystemRequest.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  if (priorFlag === undefined) delete process.env.FINOVA_ADMIN_ENABLED;
  else process.env.FINOVA_ADMIN_ENABLED = priorFlag;
});

describe("requireSystemRole: signed session, platform RBAC and shared throttling", () => {
  it("fails closed when the admin feature is disabled, before reading session or data", async () => {
    process.env.FINOVA_ADMIN_ENABLED = "0";
    await expect(requireSystemRole(roles, request()))
      .rejects.toMatchObject({ status: 503, code: "ADMIN_DISABLED" });
    expect(getSession).not.toHaveBeenCalled();
    expect(findSystemRoles).not.toHaveBeenCalled();
  });

  it("returns 401 with no authenticated Better Auth session", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireSystemRole(roles, request()))
      .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(findSystemRoles).not.toHaveBeenCalled();
    expect(limitSystemRequest).not.toHaveBeenCalled();
  });

  it("denies ordinary users and workspace owners without a platform assignment", async () => {
    // Workspace OWNER is deliberately absent from the platform role table.
    for (const userId of ["ordinary-user", "workspace-owner"]) {
      getSession.mockResolvedValue({ user: { id: userId } });
      await expect(requireSystemRole(roles, request()))
        .rejects.toMatchObject({ status: 403, code: "SYSTEM_ROLE_REQUIRED" });
    }
    expect(limitSystemRequest).not.toHaveBeenCalled();
  });

  it.each(["SUSPENDED", "DEACTIVATED"])("rejects %s accounts even with SUPER_ADMIN", async status => {
    findAccessState.mockResolvedValue({ status });
    findSystemRoles.mockResolvedValue([{ role: "SUPER_ADMIN" }]);
    await expect(requireSystemRole(roles, request()))
      .rejects.toMatchObject({ status: 403, code: "ACCOUNT_DISABLED" });
    expect(limitSystemRequest).not.toHaveBeenCalled();
  });

  it("ignores revoked roles because the query selects only active assignments", async () => {
    await expect(requireSystemRole(roles, request()))
      .rejects.toMatchObject({ status: 403, code: "SYSTEM_ROLE_REQUIRED" });
    expect(findSystemRoles).toHaveBeenCalledWith({
      where: { userId: "user-a", revokedAt: null }, select: { role: true },
    });
  });

  it.each(roles)("allows assigned %s only on permitted endpoints", async role => {
    findSystemRoles.mockResolvedValue([{ role }]);
    await expect(requireSystemRole([role], request())).resolves.toEqual({ userId: "user-a", role });
    expect(limitSystemRequest).toHaveBeenCalledWith("user-a", expect.any(NextRequest));
    const forbidden = roles.find(candidate => candidate !== role)!;
    await expect(requireSystemRole([forbidden], request()))
      .rejects.toMatchObject({ status: 403, code: "SYSTEM_ROLE_REQUIRED" });
  });

  it("enforces the admin user / payment / analytics permission matrix", async () => {
    const endpoints = [
      { path: "users", allowed: ["SUPER_ADMIN", "ADMIN"] },
      { path: "billing/payments", allowed: ["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"] },
      { path: "analytics", allowed: ["SUPER_ADMIN", "ADMIN", "ANALYST"] },
    ] as const;
    for (const endpoint of endpoints) {
      const endpointRequest = new NextRequest(`https://finova.example.test/api/v1/admin/${endpoint.path}`);
      for (const role of roles) {
        findSystemRoles.mockResolvedValue([{ role }]);
        if (endpoint.allowed.includes(role as never)) {
          await expect(requireSystemRole(endpoint.allowed, endpointRequest)).resolves.toEqual({ userId: "user-a", role });
        } else {
          await expect(requireSystemRole(endpoint.allowed, endpointRequest))
            .rejects.toMatchObject({ status: 403, code: "SYSTEM_ROLE_REQUIRED" });
        }
      }
    }
  });

  it("chooses the strongest permitted role and propagates shared rate limits", async () => {
    findSystemRoles.mockResolvedValue([{ role: "ADMIN" }, { role: "SUPER_ADMIN" }]);
    const authorized = await requireSystemRole(roles, request());
    expect(authorized.role).toBe("SUPER_ADMIN");
    limitSystemRequest.mockRejectedValueOnce(new Error("Rate limit storage unavailable"));
    await expect(requireSystemRole(roles, request())).rejects.toThrow("Rate limit storage unavailable");
  });

  it("requires a recent immutable Better Auth sign-in for sensitive account changes", async () => {
    findSystemRoles.mockResolvedValue([{ role: "ADMIN" }]);
    const now = Date.now();
    for (const createdAt of [undefined, "invalid", new Date(now - 5 * 60_000 - 1),
      new Date(now + 90_000)]) {
      getSession.mockResolvedValue({ user: { id: "user-a" },
        session: { createdAt, updatedAt: new Date() } });
      await expect(requireSystemRole(["ADMIN"], request(), { recentSignIn: true }))
        .rejects.toMatchObject({ status: 403, code: "REAUTH_REQUIRED" });
    }
    getSession.mockResolvedValue({ user: { id: "user-a" },
      session: { createdAt: new Date(now - 30_000), updatedAt: new Date() } });
    await expect(requireSystemRole(["ADMIN"], request(), { recentSignIn: true }))
      .resolves.toEqual({ userId: "user-a", role: "ADMIN" });
    expect(limitSystemRequest).toHaveBeenCalled();
    // The same old session remains valid for read-only Admin pages.
    getSession.mockResolvedValue({ user: { id: "user-a" },
      session: { createdAt: new Date(now - 86_400_000) } });
    await expect(requireSystemRole(["ADMIN"], request()))
      .resolves.toEqual({ userId: "user-a", role: "ADMIN" });
  });
});
