import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSystemRole, listAdminUsers, getAdminUser } = vi.hoisted(() => ({
  requireSystemRole: vi.fn(), listAdminUsers: vi.fn(), getAdminUser: vi.fn(),
}));
vi.mock("../../src/server/system-auth", () => ({ requireSystemRole,
  userManagementRoles: ["SUPER_ADMIN", "ADMIN"],
}));
vi.mock("../../src/modules/admin/users", () => ({ listAdminUsers, getAdminUser }));

import { GET as list } from "../../src/app/api/v1/admin/users/route";
import { GET as detail } from "../../src/app/api/v1/admin/users/[id]/route";
import { HttpError } from "../../src/server/context";

const listRequest = () => new NextRequest("http://localhost:3002/api/v1/admin/users?q=alice");
const detailRequest = () => new NextRequest("http://localhost:3002/api/v1/admin/users/other-user");
const userId = { params: Promise.resolve({ id: "other-user" }) };

beforeEach(() => {
  requireSystemRole.mockReset().mockResolvedValue({ userId: "admin", role: "ADMIN" });
  listAdminUsers.mockReset().mockResolvedValue({ total: 0, users: [] });
  getAdminUser.mockReset().mockResolvedValue({ id: "other-user", plan: "LITE" });
});

describe("admin user list/detail route authorization", () => {
  it.each(["USER", "OWNER", "ANALYST", "FINANCE_OPERATOR"])("denies %s access before any user read", async () => {
    requireSystemRole.mockRejectedValue(new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Denied"));
    expect((await list(listRequest())).status).toBe(403);
    expect((await detail(detailRequest(), userId)).status).toBe(403);
    expect(listAdminUsers).not.toHaveBeenCalled();
    expect(getAdminUser).not.toHaveBeenCalled();
  });

  it("requires session, including on cross-user direct URL", async () => {
    requireSystemRole.mockRejectedValue(new HttpError(401, "UNAUTHENTICATED", "Login"));
    expect((await detail(detailRequest(), userId)).status).toBe(401);
    expect(getAdminUser).not.toHaveBeenCalled();
  });

  it("permits only authorized platform roles, with explicitly scoped projection", async () => {
    expect((await detail(detailRequest(), userId)).status).toBe(200);
    expect(getAdminUser).toHaveBeenCalledWith("other-user");
    expect((await list(listRequest())).status).toBe(200);
    expect(listAdminUsers).toHaveBeenCalledWith({ q: "alice", cursor: undefined, status: undefined });
    expect(requireSystemRole).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN"], expect.any(NextRequest));
  });
});
