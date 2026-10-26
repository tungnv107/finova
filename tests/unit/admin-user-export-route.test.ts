import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { role, exportUsers } = vi.hoisted(() => ({ role: vi.fn(), exportUsers: vi.fn() }));
vi.mock("../../src/server/system-auth", () => ({ requireSystemRole: role }));
vi.mock("../../src/modules/admin/users", () => ({ exportAdminUsers: exportUsers }));
import { GET } from "../../src/app/api/v1/admin/users/export/route";
import { HttpError } from "../../src/server/context";

const request = (q = "") => new NextRequest(`http://localhost:3002/api/v1/admin/users/export?${q}`);
beforeEach(() => {
  role.mockReset().mockResolvedValue({ userId: "root", role: "SUPER_ADMIN" });
  exportUsers.mockReset().mockResolvedValue(new TextEncoder().encode("\uFEFFID,Tên\r\n"));
});

describe("admin user export route", () => {
  it("guards role before reading and rejects invalid status", async () => {
    role.mockRejectedValueOnce(new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Deny"));
    expect((await GET(request())).status).toBe(403);
    expect(exportUsers).not.toHaveBeenCalled();
    expect((await GET(request("status=UNKNOWN"))).status).toBe(400);
    expect(exportUsers).not.toHaveBeenCalled();
    expect(role).toHaveBeenCalledWith(["SUPER_ADMIN"], expect.any(NextRequest));
  });

  it("serves bounded CSV only with no-store/no-sniff", async () => {
    const response = await GET(request("q=alice&status=ACTIVE"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(exportUsers).toHaveBeenCalledWith({ userId: "root", role: "SUPER_ADMIN" }, { q: "alice", status: "ACTIVE" });
  });
});
