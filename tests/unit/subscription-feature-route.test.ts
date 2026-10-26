import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireContext: vi.fn(), subscription: vi.fn(), enforced: vi.fn() }));
vi.mock("@/server/context", () => ({ requireContext: mocks.requireContext }));
vi.mock("@/server/premium", () => ({ getEffectiveSubscription: mocks.subscription, premiumEnforced: mocks.enforced }));
import { GET } from "@/app/api/v1/me/subscription/route";

beforeEach(() => {
  mocks.requireContext.mockReset().mockResolvedValue({ userId: "member" });
  mocks.subscription.mockReset().mockResolvedValue({ plan: "LITE", expiresAt: null });
  mocks.enforced.mockReset().mockReturnValue(true);
});

describe("subscription API reflects actual feature flag state", () => {
  it.each([
    [true, "LITE", false],
    [true, "PREMIUM", true],
    [false, "LITE", true],
    [false, "PREMIUM", true],
  ] as const)("enforced=%s, plan=%s, features allowed=%s", async (enforced, plan, allowed) => {
    mocks.enforced.mockReturnValue(enforced);
    mocks.subscription.mockResolvedValue({ plan, expiresAt: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body.data.features).toEqual({ STATEMENT_IMPORT: allowed, BANK_SYNC: allowed, NOTIFICATIONS: allowed });
    expect(mocks.subscription).toHaveBeenCalledTimes(1);
  });
});
