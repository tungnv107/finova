import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/server/context";

const mocks = vi.hoisted(() => ({
  premium: vi.fn(), transactionalPremium: vi.fn(),
  connection: vi.fn(), connections: vi.fn(), accounts: vi.fn(), pollRunning: vi.fn(),
  running: vi.fn(), createJob: vi.fn(), updateJob: vi.fn(),
  failJob: vi.fn(), advanceWatermark: vi.fn(), historyPage: vi.fn(),
}));

vi.mock("@/server/premium", () => ({
  requireWorkspacePremium: mocks.premium,
  requireWorkspacePremiumInDb: mocks.transactionalPremium,
}));

const db = {
  bankConnection: { findFirst: mocks.connection, updateMany: mocks.advanceWatermark },
  bankAccount: { findMany: mocks.accounts },
  bankSyncJob: { findMany: mocks.running, create: mocks.createJob, updateMany: mocks.updateJob },
};
vi.mock("@/lib/db", () => ({ prisma: {
  bankConnection: { findFirst: mocks.connection, findMany: mocks.connections },
  bankAccount: { findMany: mocks.accounts },
  bankSyncJob: { updateMany: mocks.failJob, findFirst: mocks.pollRunning },
} }));
vi.mock("@/server/serializable", () => ({ serializable: (fn: (tx: unknown) => Promise<unknown>) => fn(db) }));
vi.mock("@/modules/bank-sync/service", () => ({
  bankConsentAllowsAccount: () => true,
  persistBankEnvelope: vi.fn(),
}));
vi.mock("@/modules/bank-sync/sepay/client", () => ({
  sepayClientFromEnvironment: () => ({ historyPage: mocks.historyPage }),
  sepayEnvironment: () => "sandbox", sepayEnabled: () => true,
}));

import { pollActiveSePayConnections, syncSePayHistory } from "@/modules/bank-sync/sepay/service";

const context = { workspaceId: "ws-A", userId: "user-A", name: "User A", image: null };

describe("SePay history authorization at transaction boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.premium.mockResolvedValue(undefined);
    mocks.transactionalPremium.mockResolvedValue(undefined);
    mocks.connection.mockResolvedValue({ id: "conn-A", workspaceId: "ws-A",
      providerConnectionRef: "company-A", status: "ACTIVE",
      accounts: [{ providerAccountRef: "account-A", walletId: "wallet-A" }],
      consents: [{ scopeJson: { transactions: true, bankAccountXid: "account-A" } }] });
    mocks.connections.mockResolvedValue([]);
    mocks.pollRunning.mockResolvedValue(null);
    mocks.accounts.mockResolvedValue([{ providerAccountRef: "account-A", walletId: "wallet-A" }]);
    mocks.running.mockResolvedValue([]);
    mocks.createJob.mockResolvedValue({ id: "job-A" });
    mocks.updateJob.mockResolvedValue({ count: 1 });
    mocks.failJob.mockResolvedValue({ count: 1 });
    mocks.advanceWatermark.mockResolvedValue({ count: 1 });
    mocks.historyPage.mockResolvedValue({ data: [], meta: { total_pages: 1 } });
  });

  it("authorizes claim, heartbeats and final watermark within their transactions", async () => {
    await expect(syncSePayHistory(context, "conn-A", "2026-10-21", "2026-10-22"))
      .resolves.toMatchObject({ accepted: 0, duplicates: 0, jobId: "job-A" });
    expect(mocks.transactionalPremium).toHaveBeenCalledTimes(4);
    for (const call of mocks.transactionalPremium.mock.calls) {
      expect(call[0]).toBe(db);
      expect(call[1]).toBe("ws-A");
      expect(call[2]).toBe("BANK_SYNC");
      expect(call[3]).toBeInstanceOf(Date);
    }
    expect(mocks.updateJob).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "DONE" }),
    }));
    expect(mocks.advanceWatermark).toHaveBeenCalledOnce();
    expect(mocks.failJob).not.toHaveBeenCalled();
  });

  it("does not mark DONE or advance the watermark when Premium expires after provider I/O", async () => {
    mocks.transactionalPremium.mockImplementation(async () => {
      if (mocks.transactionalPremium.mock.calls.length === 4) {
        throw new HttpError(403, "PREMIUM_REQUIRED", "Premium expired");
      }
    });
    await expect(syncSePayHistory(context, "conn-A", "2026-10-21", "2026-10-22"))
      .rejects.toMatchObject({ status: 403, code: "PREMIUM_REQUIRED" });
    expect(mocks.historyPage).toHaveBeenCalledOnce();
    expect(mocks.updateJob.mock.calls.some(([arg]) => arg.data.status === "DONE")).toBe(false);
    expect(mocks.advanceWatermark).not.toHaveBeenCalled();
    expect(mocks.failJob).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", failureReason: "PREMIUM_REQUIRED" }),
    }));
  });

  it("skips Lite and suspended owners without stopping the scheduled poller", async () => {
    mocks.connections.mockResolvedValue([
      { id: "conn-lite", workspaceId: "ws-lite", lastSyncedAt: null },
      { id: "conn-locked", workspaceId: "ws-locked", lastSyncedAt: null },
    ]);
    mocks.premium.mockImplementation(async (workspaceId: string) => {
      if (workspaceId === "ws-lite") throw new HttpError(403, "PREMIUM_REQUIRED", "Lite");
      throw new HttpError(403, "ACCOUNT_DISABLED", "Suspended");
    });
    await expect(pollActiveSePayConnections()).resolves.toEqual({ skipped: false, processed: 0, failed: 0 });
    expect(mocks.premium).toHaveBeenCalledTimes(2);
    expect(mocks.pollRunning).not.toHaveBeenCalled();
    expect(mocks.historyPage).not.toHaveBeenCalled();
  });
});
