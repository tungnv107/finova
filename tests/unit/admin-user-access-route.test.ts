import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { role, changeUserAccess } = vi.hoisted(() => ({ role: vi.fn(), changeUserAccess: vi.fn() }));
vi.mock("../../src/server/system-auth", () => ({ requireSystemRole: role,
  userManagementRoles: ["SUPER_ADMIN", "ADMIN"] }));
vi.mock("../../src/modules/admin/users", () => ({ changeUserAccess }));

import { HttpError } from "../../src/server/context";
import { PATCH } from "../../src/app/api/v1/admin/users/[id]/access/route";

const priorOrigin = process.env.BETTER_AUTH_URL;
const actor = { userId: "admin-one", role: "ADMIN" };
const params = { params: Promise.resolve({ id: "member" }) };
function request(origin = "http://localhost:3002", reason = "Documented account security incident") {
  return new NextRequest("http://localhost:3002/api/v1/admin/users/member/access", {
    method: "PATCH", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ status: "SUSPENDED", reason }),
  });
}

beforeEach(() => {
  process.env.BETTER_AUTH_URL = "http://localhost:3002";
  role.mockReset().mockResolvedValue(actor);
  changeUserAccess.mockReset().mockResolvedValue({ id: "member", status: "SUSPENDED" });
});
afterEach(() => {
  if (priorOrigin === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = priorOrigin;
});

describe("sensitive user status mutation", () => {
  it("rejects forged origin before auth and does not change any user", async () => {
    expect((await PATCH(request("https://evil.test"), params)).status).toBe(403);
    expect(role).not.toHaveBeenCalled();
    expect(changeUserAccess).not.toHaveBeenCalled();
  });
  it("requires server-verified fresh sign-in and denies stale sessions before mutation", async () => {
    role.mockRejectedValue(new HttpError(403, "REAUTH_REQUIRED", "Sign in again"));
    const result = await PATCH(request(), params);
    expect(result.status).toBe(403);
    expect((await result.json()).error.code).toBe("REAUTH_REQUIRED");
    expect(changeUserAccess).not.toHaveBeenCalled();
    expect(role).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN"], expect.any(NextRequest),
      { recentSignIn: true });
  });
  it("updates only after fresh role check and validated reason", async () => {
    expect((await PATCH(request(undefined, "too short"), params)).status).toBe(400);
    expect(changeUserAccess).not.toHaveBeenCalled();
    expect((await PATCH(request(), params)).status).toBe(200);
    expect(changeUserAccess).toHaveBeenCalledWith(actor, "member", "SUSPENDED",
      "Documented account security incident");
  });
});
