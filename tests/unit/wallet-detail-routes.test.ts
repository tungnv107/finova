import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getWallets } from "@/app/api/v1/wallets/route";
import { GET as getDetail } from "@/app/api/v1/wallets/[id]/route";

const mocked = vi.hoisted(() => ({ requireContext: vi.fn(), walletBalances: vi.fn(), walletLedgerDetail: vi.fn(), walletCutoff: vi.fn() }));
vi.mock("@/server/context", async importOriginal => ({ ...await importOriginal<typeof import("@/server/context")>(), requireContext: mocked.requireContext }));
vi.mock("@/server/ledger", () => ({ walletBalances: mocked.walletBalances, createWallet: vi.fn(), updateWallet: vi.fn() }));
vi.mock("@/server/wallet-detail", () => ({ walletLedgerDetail: mocked.walletLedgerDetail, walletCutoff: mocked.walletCutoff }));

beforeEach(() => {
  vi.clearAllMocks();
  mocked.requireContext.mockResolvedValue({ workspaceId: "owned-workspace", userId: "member" });
  mocked.walletBalances.mockResolvedValue([]);
  mocked.walletLedgerDetail.mockResolvedValue({ wallet: { id: "wallet-a", balance: "0" }, entries: [] });
  mocked.walletCutoff.mockReturnValue(new Date("2026-10-21T10:00:00Z"));
});

describe("wallet scoped read routes", () => {
  it("passes the authenticated workspace and validated as-of cutoff to list", async () => {
    const request = new NextRequest("http://localhost:3002/api/v1/wallets?asOf=2026-10-20&workspaceId=foreign");
    const response = await getWallets(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocked.walletCutoff).toHaveBeenCalledWith("2026-10-20");
    expect(mocked.walletBalances).toHaveBeenCalledWith("owned-workspace", new Date("2026-10-21T10:00:00Z"));
  });
  it("passes only session workspace, path ID, date and cursor to detail", async () => {
    const request = new NextRequest("http://localhost:3002/api/v1/wallets/wallet-a?asOf=2026-10-20&cursor=last&workspaceId=foreign");
    const response = await getDetail(request, { params: Promise.resolve({ id: "wallet-a" }) });
    expect(response.status).toBe(200);
    expect(mocked.walletLedgerDetail).toHaveBeenCalledWith("owned-workspace", "wallet-a", "2026-10-20", "last");
  });
  it("rejects unauthenticated reads without fetching balances", async () => {
    const { HttpError } = await import("@/server/context");
    mocked.requireContext.mockRejectedValue(new HttpError(401, "UNAUTHENTICATED", "Sign in required"));
    const response = await getDetail(new NextRequest("http://localhost:3002/api/v1/wallets/wallet-a"), { params: Promise.resolve({ id: "wallet-a" }) });
    expect(response.status).toBe(401);
    expect(mocked.walletLedgerDetail).not.toHaveBeenCalled();
  });
});
