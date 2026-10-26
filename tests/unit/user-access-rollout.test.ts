import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), findAccessState: vi.fn(), findWorkspace: vi.fn(),
  bootstrap: vi.fn(), limit: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/db", () => ({ prisma: {
  userAccessState: { findUnique: mocks.findAccessState },
  workspace: { findUnique: mocks.findWorkspace },
} }));
vi.mock("@/server/bootstrap", () => ({ bootstrapPersonalWorkspace: mocks.bootstrap }));
vi.mock("@/server/rate-limit", () => ({ limitAuthenticatedRequest: mocks.limit }));

import { assertUserActive, requireContext } from "@/server/context";
import { requireWorkspacePremiumInDb, requireWorkspacePremium } from "@/server/premium";

const originalFlags = {
  admin: process.env.FINOVA_ADMIN_ENABLED,
  access: process.env.FINOVA_USER_ACCESS_ENFORCED,
  premium: process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED,
};

beforeEach(() => {
  process.env.FINOVA_ADMIN_ENABLED = "0";
  process.env.FINOVA_USER_ACCESS_ENFORCED = "1";
  process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "0";
  mocks.getSession.mockReset().mockResolvedValue({ user: { id: "member", name: "Member" } });
  mocks.findAccessState.mockReset().mockResolvedValue({ status: "ACTIVE" });
  mocks.findWorkspace.mockReset().mockResolvedValue({ createdById: "member" });
  mocks.bootstrap.mockReset().mockResolvedValue("personal-workspace");
  mocks.limit.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  for (const [key, prior] of [
    ["FINOVA_ADMIN_ENABLED", originalFlags.admin],
    ["FINOVA_USER_ACCESS_ENFORCED", originalFlags.access],
    ["FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED", originalFlags.premium],
  ] as const) {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
});

describe("account suspension survives Admin UI rollback", () => {
  it.each(["SUSPENDED", "DEACTIVATED"])("rejects %s on authenticated API after Admin rollback", async status => {
    mocks.findAccessState.mockResolvedValue({ status });
    const request = new NextRequest("https://finova.example.test/api/v1/wallets");
    await expect(requireContext(request)).rejects.toMatchObject({ status: 403, code: "ACCOUNT_DISABLED" });
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("continues to allow active users with Premium paywall disabled", async () => {
    await expect(requireContext(new NextRequest("https://finova.example.test/api/v1/wallets")))
      .resolves.toMatchObject({ userId: "member", workspaceId: "personal-workspace" });
    expect(mocks.findAccessState).toHaveBeenCalled();
  });

  it("checks account status within a bank/import/notification write transaction", async () => {
    mocks.findAccessState.mockResolvedValue({ status: "SUSPENDED" });
    const db = { workspace: { findUnique: mocks.findWorkspace }, userAccessState: { findUnique: mocks.findAccessState } };
    for (const feature of ["BANK_SYNC", "STATEMENT_IMPORT", "NOTIFICATIONS"] as const) {
      await expect(requireWorkspacePremiumInDb(db as never, "personal-workspace", feature))
        .rejects.toMatchObject({ status: 403, code: "ACCOUNT_DISABLED" });
    }
    await expect(requireWorkspacePremium("personal-workspace", "BANK_SYNC"))
      .rejects.toMatchObject({ status: 403, code: "ACCOUNT_DISABLED" });
  });

  it("does not swallow a storage failure when account restrictions are enforced", async () => {
    mocks.findAccessState.mockRejectedValue(new Error("database unavailable"));
    await expect(assertUserActive("member")).rejects.toThrow("database unavailable");
  });

  it("preserves pre-migration compatibility until either access or Admin flag is enabled", async () => {
    process.env.FINOVA_USER_ACCESS_ENFORCED = "0";
    await expect(assertUserActive("member")).resolves.toBeUndefined();
    await expect(requireWorkspacePremium("personal-workspace", "BANK_SYNC")).resolves.toBeUndefined();
    expect(mocks.findAccessState).not.toHaveBeenCalled();
    process.env.FINOVA_ADMIN_ENABLED = "1";
    mocks.findAccessState.mockResolvedValue({ status: "DEACTIVATED" });
    await expect(assertUserActive("member")).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
  });
});
