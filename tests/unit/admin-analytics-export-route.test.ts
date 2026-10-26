import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSystemRole, prepare, encode } = vi.hoisted(() => ({
  requireSystemRole: vi.fn(), prepare: vi.fn(), encode: vi.fn(),
}));
vi.mock("../../src/server/system-auth", () => ({ requireSystemRole,
  allReportingRoles: ["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR", "ANALYST"],
}));
vi.mock("../../src/modules/admin/analytics-export", () => ({
  prepareAdminAggregateReport: prepare, encodeAdminAggregateReport: encode,
}));

import { GET } from "../../src/app/api/v1/admin/analytics/export/route";
import { HttpError } from "../../src/server/context";

function request(query = "kind=billing&format=csv&days=30") {
  return new NextRequest(`http://localhost:3002/api/v1/admin/analytics/export?${query}`);
}

beforeEach(() => {
  requireSystemRole.mockReset().mockResolvedValue({ userId: "admin1", role: "ADMIN" });
  prepare.mockReset().mockResolvedValue({ kind: "billing", fromVn: "2026-09-25", untilVn: "2026-10-24" });
  encode.mockReset().mockResolvedValue(new TextEncoder().encode("\uFEFFmetric,value\r\npaid,29000\r\n"));
});

describe("admin aggregate export API authorization", () => {
  it("enforces a signed system role before reading data", async () => {
    requireSystemRole.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED", "Sign in"));
    expect((await GET(request())).status).toBe(401);
    requireSystemRole.mockRejectedValueOnce(new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Deny"));
    expect((await GET(request())).status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not allow Finance to export user activity", async () => {
    requireSystemRole.mockResolvedValue({ userId: "finance1", role: "FINANCE_OPERATOR" });
    const response = await GET(request("kind=traffic&format=xlsx&days=7"));
    expect(response.status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects unbounded or unsupported query parameters", async () => {
    for (const query of ["kind=traffic&format=csv&days=365", "kind=users&format=csv&days=7",
      "kind=billing&format=pdf&days=30", "kind=billing&format=csv&days=-1"]) {
      expect((await GET(request(query))).status).toBe(400);
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it("delivers a private aggregate download to a permitted role", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("finova-admin-billing-2026-09-25-2026-10-24.csv");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(prepare).toHaveBeenCalledWith("billing", 30);
  });
});
