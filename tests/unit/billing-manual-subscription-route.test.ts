import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { role, propose, decide, findGrant } = vi.hoisted(() => ({
  role: vi.fn(), propose: vi.fn(), decide: vi.fn(), findGrant: vi.fn(),
}));
vi.mock("../../src/server/system-auth", () => ({ requireSystemRole: role, userManagementRoles: ["SUPER_ADMIN", "ADMIN"] }));
vi.mock("../../src/modules/billing/manual-subscriptions", () => ({
  proposeSubscriptionAction: propose, decideSubscriptionAction: decide,
}));
vi.mock("../../src/lib/db", () => ({ prisma: { subscriptionGrant: { findUnique: findGrant } } }));

import { HttpError } from "../../src/server/context";
import { POST as proposeGrant } from "../../src/app/api/v1/admin/users/[id]/subscription/grants/route";
import { POST as revoke } from "../../src/app/api/v1/admin/subscriptions/[id]/revoke/route";
import { POST as decision } from "../../src/app/api/v1/admin/subscriptions/actions/[id]/decision/route";

const previousOrigin = process.env.BETTER_AUTH_URL;
const actor = { userId: "admin-id", role: "SUPER_ADMIN" };
function req(path: string, body: unknown, origin: string | null = "http://localhost:3002") {
  return new NextRequest(`http://localhost:3002${path}`, { method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  });
}
const grantBody = { period: "MONTH", reason: "Compensate documented service disruption", idempotencyKey: "unique_123456" };
const revokeBody = { reason: "Reverse documented mistaken manual grant", idempotencyKey: "unique_654321" };
const decisionBody = { decision: "APPROVE", reason: "Independent approval after review" };
const grantPath = "/api/v1/admin/users/customer/subscription/grants";
const revokePath = "/api/v1/admin/subscriptions/manual-grant/revoke";
const reviewPath = "/api/v1/admin/subscriptions/actions/request-id/decision";

beforeEach(() => {
  process.env.BETTER_AUTH_URL = "http://localhost:3002";
  role.mockReset().mockResolvedValue(actor);
  propose.mockReset().mockResolvedValue({ id: "request-id", status: "PENDING" });
  decide.mockReset().mockResolvedValue({ id: "request-id", status: "APPROVED" });
  findGrant.mockReset().mockResolvedValue({ userId: "customer" });
});
afterEach(() => {
  if (previousOrigin === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = previousOrigin;
});

describe("two-person subscription action API", () => {
  it("enforces Origin before session and never calls business logic for forged mutation", async () => {
    for (const origin of [null, "https://attacker.example"]) {
      expect((await proposeGrant(req(grantPath, grantBody, origin), { params: Promise.resolve({ id: "customer" }) })).status).toBe(403);
      expect((await decision(req(reviewPath, decisionBody, origin), { params: Promise.resolve({ id: "request-id" }) })).status).toBe(403);
    }
    expect(role).not.toHaveBeenCalled();
    expect(propose).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
  });
  it("enforces signed roles and validates amount/period/reason input", async () => {
    role.mockRejectedValueOnce(new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Forbidden"));
    expect((await proposeGrant(req(grantPath, grantBody), { params: Promise.resolve({ id: "customer" }) })).status).toBe(403);
    expect((await proposeGrant(req(grantPath, { ...grantBody, period: "CENTURY" }), { params: Promise.resolve({ id: "customer" }) })).status).toBe(400);
    expect((await revoke(req(revokePath, { ...revokeBody, reason: "short" }), { params: Promise.resolve({ id: "manual-grant" }) })).status).toBe(400);
    expect((await decision(req(reviewPath, { ...decisionBody, decision: "FORCE" }), { params: Promise.resolve({ id: "request-id" }) })).status).toBe(400);
    expect(propose).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
  });
  it("submits proposals and reviewer decisions with actor identity", async () => {
    expect((await proposeGrant(req(grantPath, grantBody), { params: Promise.resolve({ id: "customer" }) })).status).toBe(202);
    expect(propose).toHaveBeenCalledWith(actor, { ...grantBody, userId: "customer", kind: "MANUAL_GRANT" });
    expect((await revoke(req(revokePath, revokeBody), { params: Promise.resolve({ id: "manual-grant" }) })).status).toBe(202);
    expect(propose).toHaveBeenCalledWith(actor, { ...revokeBody, userId: "customer", kind: "REVOKE_MANUAL", grantId: "manual-grant" });
    expect((await decision(req(reviewPath, decisionBody), { params: Promise.resolve({ id: "request-id" }) })).status).toBe(200);
    expect(decide).toHaveBeenCalledWith(actor, "request-id", "APPROVE", decisionBody.reason);
    expect(findGrant).toHaveBeenCalledWith({ where: { id: "manual-grant" }, select: { userId: true } });
  });
});
