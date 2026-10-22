import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(), account: vi.fn(), linkedAccounts: vi.fn(), deactivate: vi.fn(), activeCount: vi.fn(),
  pause: vi.fn(), revokeConsent: vi.fn(), audit: vi.fn(), listRemote: vi.fn(), hostedLink: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: {
  bankConnection: { findFirst: mocks.connection }, bankAccount: { findFirst: mocks.account },
  bankAuditEvent: { create: mocks.audit },
} }));
vi.mock("@/server/serializable", () => ({ serializable: async (fn: (db: unknown) => Promise<unknown>) => fn({
  bankConnection: { findFirst: mocks.connection, update: mocks.pause },
  bankAccount: { findMany: mocks.linkedAccounts, updateMany: mocks.deactivate, count: mocks.activeCount },
  bankConsent: { updateMany: mocks.revokeConsent }, bankAuditEvent: { create: mocks.audit },
}) }));
vi.mock("@/modules/bank-sync/service", () => ({ persistBankEnvelope: vi.fn() }));
vi.mock("@/modules/bank-sync/sepay/client", () => ({
  sepayClientFromEnvironment: () => ({ listAccounts: mocks.listRemote, createLink: mocks.hostedLink }),
  sepayEnvironment: () => "sandbox", sepayEnabled: () => true,
}));

import { refreshSePayAccountStatuses, startSePayUnlink } from "@/modules/bank-sync/sepay/service";

const context = { workspaceId: "workspace-A", userId: "user-A", name: "User A", image: null };

describe("SePay account ownership and unlink state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue({ id: "connection-A", workspaceId: "workspace-A", providerConnectionRef: "company-A", status: "ACTIVE" });
    mocks.account.mockResolvedValue({ providerAccountRef: "bank-A" });
    mocks.linkedAccounts.mockResolvedValue([{ id: "account-A", providerAccountRef: "bank-A" },
      { id: "account-B", providerAccountRef: "bank-B" }]);
    mocks.listRemote.mockResolvedValue([{ xid: "bank-A", active: "0" }, { xid: "bank-B", active: "1" }]);
    mocks.hostedLink.mockResolvedValue({ hostedLinkUrl: "https://bankhub.sepay.vn/link/unlink", expiresAt: "2026-10-22 20:00:00" });
    mocks.deactivate.mockResolvedValue({ count: 1 });
    mocks.activeCount.mockResolvedValue(1);
    mocks.revokeConsent.mockResolvedValue({ count: 1 });
  });

  it("refuses unlink if the connection or account is outside the authenticated workspace", async () => {
    mocks.connection.mockResolvedValueOnce(null);
    await expect(startSePayUnlink(context, "connection-B", "account-B")).rejects.toMatchObject({ code: "SEPAY_CONNECTION_MISSING" });
    mocks.account.mockResolvedValueOnce(null);
    await expect(startSePayUnlink(context, "connection-A", "account-B")).rejects.toMatchObject({ code: "SEPAY_ACCOUNT_MISSING" });
    expect(mocks.hostedLink).not.toHaveBeenCalled();
    expect(mocks.account).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      workspaceId: context.workspaceId, connectionId: "connection-A", id: "account-B", status: "ACTIVE",
    }) }));
  });

  it("requests SePay's account-scoped unlink and audits the initiation", async () => {
    const result = await startSePayUnlink(context, "connection-A", "account-A");
    expect(mocks.hostedLink).toHaveBeenCalledWith("company-A", "UNLINK_BANK_ACCOUNT", "bank-A");
    expect(result).toMatchObject({ accountId: "account-A", hostedLinkUrl: "https://bankhub.sepay.vn/link/unlink" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workspaceId: context.workspaceId, action: "SEPAY_UNLINK_STARTED" }),
    }));
  });

  it("retires only provider-confirmed inactive accounts and their consent", async () => {
    expect(await refreshSePayAccountStatuses(context, "connection-A")).toEqual({ deactivated: 1, active: 1 });
    expect(mocks.deactivate).toHaveBeenCalledOnce();
    expect(mocks.deactivate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "account-A" }) }));
    expect(mocks.revokeConsent).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      workspaceId: context.workspaceId, scopeJson: { path: ["bankAccountXid"], equals: "bank-A" },
    }) }));
    expect(mocks.pause).not.toHaveBeenCalled();
  });

  it("keeps unknown provider statuses untouched and pauses once all accounts are inactive", async () => {
    mocks.listRemote.mockResolvedValueOnce([{ xid: "bank-A", active: null }]);
    mocks.activeCount.mockResolvedValueOnce(2);
    expect(await refreshSePayAccountStatuses(context, "connection-A")).toEqual({ deactivated: 0, active: 2 });
    expect(mocks.deactivate).not.toHaveBeenCalled();
    mocks.listRemote.mockResolvedValueOnce([{ xid: "bank-A", active: "0" }, { xid: "bank-B", active: "0" }]);
    mocks.activeCount.mockResolvedValueOnce(0);
    expect(await refreshSePayAccountStatuses(context, "connection-A")).toEqual({ deactivated: 2, active: 0 });
    expect(mocks.pause).toHaveBeenCalledWith({ where: { id: "connection-A" }, data: { status: "PAUSED" } });
  });
});
