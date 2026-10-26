import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { context, submit, list } = vi.hoisted(() => ({
  context: vi.fn(), submit: vi.fn(), list: vi.fn(),
}));
vi.mock("@/server/context", async importOriginal => {
  const original = await importOriginal<typeof import("@/server/context")>();
  return { ...original, requireContext: context };
});
vi.mock("@/modules/billing/manual-subscriptions", () => ({
  requestPremiumRegistration: submit, listMyPremiumRegistrations: list,
}));

import { HttpError } from "@/server/context";
import { GET, POST } from "@/app/api/v1/me/premium-registrations/route";

const path = "http://localhost:3002/api/v1/me/premium-registrations";
const previousOrigin = process.env.BETTER_AUTH_URL;
const previousAdmin = process.env.FINOVA_ADMIN_ENABLED;

function post(body: unknown, origin: string | null = "http://localhost:3002") {
  return new NextRequest(path, { method: "POST", headers: {
    "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}),
  }, body: JSON.stringify(body) });
}

beforeEach(() => {
  process.env.BETTER_AUTH_URL = "http://localhost:3002";
  process.env.FINOVA_ADMIN_ENABLED = "1";
  context.mockReset().mockResolvedValue({ userId: "signed-in-member" });
  submit.mockReset().mockResolvedValue({ id: "registration-id", status: "PENDING" });
  list.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  if (previousOrigin === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = previousOrigin;
  if (previousAdmin === undefined) delete process.env.FINOVA_ADMIN_ENABLED;
  else process.env.FINOVA_ADMIN_ENABLED = previousAdmin;
});

describe("Premium self-registration HTTP boundary", () => {
  it("rejects cross-origin, absent Origin, and unauthenticated POST before creating requests", async () => {
    for (const origin of [null, "https://attacker.example"]) {
      const response = await POST(post({ period: "MONTH", idempotencyKey: "valid_key_123" }, origin));
      expect(response.status).toBe(403);
    }
    expect(context).not.toHaveBeenCalled();
    context.mockRejectedValueOnce(new HttpError(401, "UNAUTHORIZED", "Sign in required"));
    expect((await POST(post({ period: "MONTH", idempotencyKey: "valid_key_123" }))).status).toBe(401);
    expect(submit).not.toHaveBeenCalled();
  });

  it("validates a strict input schema and always binds registration to the session user", async () => {
    for (const body of [
      { period: "WEEK", idempotencyKey: "valid_key_123" },
      { period: "YEAR", idempotencyKey: "too-short".slice(0, 5) },
      { period: "MONTH", idempotencyKey: "valid_key_123", userId: "another-user" },
    ]) expect((await POST(post(body))).status).toBe(400);
    expect(submit).not.toHaveBeenCalled();

    const response = await POST(post({ period: "YEAR", idempotencyKey: "valid_key_123" }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(submit).toHaveBeenCalledExactlyOnceWith("signed-in-member", "YEAR", "valid_key_123");
    expect((await response.json()).data).toMatchObject({ status: "PENDING" });
  });

  it("lists only registrations for the signed-in user and propagates service errors", async () => {
    const response = await GET(new NextRequest(path));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(list).toHaveBeenCalledExactlyOnceWith("signed-in-member");
    submit.mockRejectedValueOnce(new HttpError(409, "REGISTRATION_PENDING", "Existing request"));
    const failed = await POST(post({ period: "MONTH", idempotencyKey: "valid_key_123" }));
    expect(failed.status).toBe(409);
    expect((await failed.json()).error.code).toBe("REGISTRATION_PENDING");
  });
});
