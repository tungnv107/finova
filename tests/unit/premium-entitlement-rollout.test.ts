import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), findAccessState: vi.fn(), findGrants: vi.fn(),
  findWorkspace: vi.fn(), findGrantInDb: vi.fn(), findSuperAdmin: vi.fn(),
  bootstrap: vi.fn(), limit: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/db", () => ({ prisma: {
  userAccessState: { findUnique: mocks.findAccessState },
  subscriptionGrant: { findMany: mocks.findGrants },
  systemRoleAssignment: { findFirst: mocks.findSuperAdmin },
  workspace: { findUnique: mocks.findWorkspace },
} }));
vi.mock("@/server/bootstrap", () => ({ bootstrapPersonalWorkspace: mocks.bootstrap }));
vi.mock("@/server/rate-limit", () => ({ limitAuthenticatedRequest: mocks.limit }));

import { requireBankSyncContext, requireNotificationsContext, requireStatementImportContext,
  requireWorkspacePremiumInDb, hasPremiumFeature, getEffectiveSubscription } from "@/server/premium";

const originalFlags = {
  admin: process.env.FINOVA_ADMIN_ENABLED,
  premium: process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED,
  access: process.env.FINOVA_USER_ACCESS_ENFORCED,
};
const grants = [{ expiresAt: new Date("2027-01-01T00:00:00Z") }];
const guards = [requireStatementImportContext, requireBankSyncContext, requireNotificationsContext];
const features = ["STATEMENT_IMPORT", "BANK_SYNC", "NOTIFICATIONS"] as const;
const request = () => new NextRequest("https://finova.example.test/api/v1/imports/preview");

beforeEach(() => {
  process.env.FINOVA_ADMIN_ENABLED = "1";
  process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "1";
  process.env.FINOVA_USER_ACCESS_ENFORCED = "1";
  mocks.getSession.mockReset().mockResolvedValue({ user: { id: "member", name: "Member" } });
  mocks.findAccessState.mockReset().mockResolvedValue({ status: "ACTIVE" });
  mocks.findGrants.mockReset().mockResolvedValue([]);
  mocks.findSuperAdmin.mockReset().mockResolvedValue(null);
  mocks.findWorkspace.mockReset().mockResolvedValue({ createdById: "member" });
  mocks.findGrantInDb.mockReset().mockResolvedValue(null);
  mocks.bootstrap.mockReset().mockResolvedValue("workspace");
  mocks.limit.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  for (const [key, value] of [
    ["FINOVA_ADMIN_ENABLED", originalFlags.admin],
    ["FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED", originalFlags.premium],
    ["FINOVA_USER_ACCESS_ENFORCED", originalFlags.access],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("server-side Lite/Premium feature rollout", () => {
  it("denies all three feature entry points for Lite", async () => {
    for (const guard of guards) await expect(guard(request())).rejects.toMatchObject({ status: 403, code: "PREMIUM_REQUIRED" });
    for (const feature of features) expect(await hasPremiumFeature("member", feature)).toBe(false);
  });

  it("allows all three entry points with an active paid grant", async () => {
    mocks.findGrants.mockResolvedValue(grants);
    for (const guard of guards) await expect(guard(request())).resolves.toMatchObject({ userId: "member" });
    for (const feature of features) expect(await hasPremiumFeature("member", feature)).toBe(true);
    expect((await getEffectiveSubscription("member")).plan).toBe("PREMIUM");
  });

  it("removes entitlement immediately after expiry or revoke", async () => {
    mocks.findGrants.mockResolvedValueOnce(grants).mockResolvedValue([]);
    expect((await getEffectiveSubscription("member")).plan).toBe("PREMIUM");
    for (const guard of guards) await expect(guard(request())).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    expect(mocks.findGrants).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ revokedAt: null, expiresAt: expect.objectContaining({ gt: expect.any(Date) }) }),
    }));
  });

  it("blocks worker writes inside the transaction after grant expires or is revoked", async () => {
    const db = {
      workspace: { findUnique: mocks.findWorkspace },
      userAccessState: { findUnique: mocks.findAccessState },
      subscriptionGrant: { findFirst: mocks.findGrantInDb },
      systemRoleAssignment: { findFirst: mocks.findSuperAdmin },
    };
    for (const feature of features) {
      await expect(requireWorkspacePremiumInDb(db as never, "workspace", feature))
        .rejects.toMatchObject({ status: 403, code: "PREMIUM_REQUIRED" });
    }
    mocks.findGrantInDb.mockResolvedValue({ id: "grant" });
    for (const feature of features) await expect(requireWorkspacePremiumInDb(db as never, "workspace", feature))
      .resolves.toBeUndefined();
  });

  it("leaves existing features usable when the entitlement rollout flag is off", async () => {
    process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "0";
    for (const guard of guards) await expect(guard(request())).resolves.toMatchObject({ userId: "member" });
    for (const feature of features) expect(await hasPremiumFeature("member", feature)).toBe(true);
    expect(mocks.findGrants).not.toHaveBeenCalled();
  });

  it("gives Super Admin Premium without a paid grant or expiry, including worker writes", async () => {
    mocks.findSuperAdmin.mockResolvedValue({ id: "role-1" });
    const subscription = await getEffectiveSubscription("member");
    expect(subscription).toEqual({ plan: "PREMIUM", expiresAt: null });
    for (const feature of features) expect(await hasPremiumFeature("member", feature)).toBe(true);
    const db = { workspace: { findUnique: mocks.findWorkspace },
      userAccessState: { findUnique: mocks.findAccessState },
      systemRoleAssignment: { findFirst: mocks.findSuperAdmin },
      subscriptionGrant: { findFirst: mocks.findGrantInDb } };
    await expect(requireWorkspacePremiumInDb(db as never, "workspace", "BANK_SYNC")).resolves.toBeUndefined();
    expect(mocks.findGrantInDb).not.toHaveBeenCalled();
  });

  it("enforces Lite when Admin is on and premium flag is unset", async () => {
    delete process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED;
    await expect(requireBankSyncContext(request())).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
  });

  it("keeps suspended users blocked with Admin UI and Premium paywall both off", async () => {
    process.env.FINOVA_ADMIN_ENABLED = "0";
    process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "0";
    mocks.findAccessState.mockResolvedValue({ status: "SUSPENDED" });
    for (const guard of guards) await expect(guard(request())).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
  });
});
