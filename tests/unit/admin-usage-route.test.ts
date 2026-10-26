import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireContext, recordPageview, enabled } = vi.hoisted(() => ({
  requireContext: vi.fn(), recordPageview: vi.fn(), enabled: vi.fn(),
}));
vi.mock("../../src/server/context", () => ({
  requireContext,
  HttpError: class HttpError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));
vi.mock("../../src/modules/admin/usage", () => ({
  usageAnalyticsEnabled: enabled, recordAuthenticatedPageview: recordPageview,
}));

import { POST } from "../../src/app/api/v1/usage/pageview/route";
import { HttpError } from "../../src/server/context";

const valid = { navigationId: "33333333-3333-4333-8333-333333333333", routeGroup: "REPORTS" };
const previousAppUrl = process.env.BETTER_AUTH_URL;

function request(body: unknown = valid, origin: string | null = "http://localhost:3002", agent = "Finova browser") {
  return new NextRequest("http://localhost:3002/api/v1/usage/pageview", {
    method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "User-Agent": agent, ...(origin ? { Origin: origin } : {}) },
  });
}

beforeEach(() => {
  process.env.BETTER_AUTH_URL = "http://localhost:3002";
  requireContext.mockReset().mockResolvedValue({ userId: "authenticated-user" });
  recordPageview.mockReset().mockResolvedValue({ counted: true, disabled: false });
  enabled.mockReset().mockReturnValue(true);
});
afterEach(() => {
  if (previousAppUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = previousAppUrl;
});

describe("private usage pageview route", () => {
  it("is disabled by default flag without authenticating or storing anything", async () => {
    enabled.mockReturnValue(false);
    expect((await POST(request())).status).toBe(204);
    expect(requireContext).not.toHaveBeenCalled();
    expect(recordPageview).not.toHaveBeenCalled();
  });
  it("requires a trusted Origin", async () => {
    expect((await POST(request(valid, null))).status).toBe(403);
    expect((await POST(request(valid, "https://untrusted.example"))).status).toBe(403);
    expect(recordPageview).not.toHaveBeenCalled();
  });
  it("rejects an unauthenticated or disabled account before recording", async () => {
    requireContext.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED", "Sign in"));
    expect((await POST(request())).status).toBe(401);
    requireContext.mockRejectedValueOnce(new HttpError(403, "ACCOUNT_DISABLED", "Suspended"));
    expect((await POST(request())).status).toBe(403);
    expect(recordPageview).not.toHaveBeenCalled();
  });
  it("ignores bot activity even with an authenticated session", async () => {
    expect((await POST(request(valid, "http://localhost:3002", "ExampleCrawler/1.0"))).status).toBe(204);
    expect(recordPageview).not.toHaveBeenCalled();
  });
  it("rejects forged route groups, invalid navigation IDs and financial/URL payload fields", async () => {
    for (const body of [
      { ...valid, routeGroup: "ADMIN" },
      { ...valid, navigationId: "not-a-uuid" },
      { ...valid, rawPath: "/wallets/secret?amount=100" },
      { ...valid, amountVnd: 123456 },
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(recordPageview).not.toHaveBeenCalled();
  });
  it("accepts only valid categories and passes the authenticated user ID", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(recordPageview).toHaveBeenCalledOnce();
    expect(recordPageview).toHaveBeenCalledWith("authenticated-user", valid.navigationId, "REPORTS");
  });
});
