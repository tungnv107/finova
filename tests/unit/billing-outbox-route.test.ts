import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { role, requeue } = vi.hoisted(() => ({ role: vi.fn(), requeue: vi.fn() }));
vi.mock("../../src/server/system-auth", () => ({ requireSystemRole: role }));
vi.mock("../../src/modules/billing/outbox", () => ({ requeueDeadLetterBillingNotice: requeue }));

import { HttpError } from "../../src/server/context";
import { POST } from "../../src/app/api/v1/admin/billing/notices/[id]/requeue/route";

const oldOrigin = process.env.BETTER_AUTH_URL;
const id = "test-notice-id";
function request(origin: string | null = "http://localhost:3002", body: unknown = { reason: "Test operator review complete" }) {
  return new NextRequest(`http://localhost:3002/api/v1/admin/billing/notices/${id}/requeue`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.BETTER_AUTH_URL = "http://localhost:3002";
  role.mockReset().mockResolvedValue({ userId: "admin", role: "SUPER_ADMIN" });
  requeue.mockReset().mockResolvedValue({ id, status: "QUEUED" });
});
afterEach(() => {
  if (oldOrigin === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = oldOrigin;
});

describe("admin billing notice replay API", () => {
  it("rejects forged or missing Origin before invoking admin role guard", async () => {
    expect((await POST(request(null), { params: Promise.resolve({ id }) })).status).toBe(403);
    expect((await POST(request("https://foreign.test"), { params: Promise.resolve({ id }) })).status).toBe(403);
    expect(role).not.toHaveBeenCalled();
  });
  it("rejects signed non-admin sessions", async () => {
    role.mockRejectedValue(new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Forbidden"));
    expect((await POST(request(), { params: Promise.resolve({ id }) })).status).toBe(403);
    expect(requeue).not.toHaveBeenCalled();
  });
  it("requires reason and queues with actor identity rather than creating a grant", async () => {
    expect((await POST(request(undefined, { reason: "short" }), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect(requeue).not.toHaveBeenCalled();
    const result = await POST(request(), { params: Promise.resolve({ id }) });
    expect(result.status).toBe(200);
    expect(requeue).toHaveBeenCalledOnce();
    expect(requeue).toHaveBeenCalledWith({ userId: "admin", role: "SUPER_ADMIN" }, id, "Test operator review complete");
  });
});
