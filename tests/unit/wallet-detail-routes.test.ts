import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getWallets } from "@/app/api/v1/wallets/route";
import { GET as getDetail, DELETE as deleteWalletRoute } from "@/app/api/v1/wallets/[id]/route";

const mocked = vi.hoisted(() => ({ requireContext: vi.fn(), walletBalances: vi.fn(), walletLedgerDetail: vi.fn(), walletCutoff: vi.fn(), deleteWallet: vi.fn() }));
vi.mock("@/server/context", async importOriginal => ({ ...await importOriginal<typeof import("@/server/context")>(), requireContext: mocked.requireContext }));
vi.mock("@/server/ledger", () => ({ walletBalances: mocked.walletBalances, createWallet: vi.fn(), updateWallet: vi.fn(), deleteWallet: mocked.deleteWallet }));
vi.mock("@/server/wallet-detail", () => ({ walletLedgerDetail: mocked.walletLedgerDetail, walletCutoff: mocked.walletCutoff }));

beforeEach(() => {
  vi.clearAllMocks();
  mocked.requireContext.mockResolvedValue({ workspaceId: "owned-workspace", userId: "member" });
  mocked.walletBalances.mockResolvedValue([]);
  mocked.walletLedgerDetail.mockResolvedValue({ wallet: { id: "wallet-a", balance: "0" }, entries: [] });
  mocked.walletCutoff.mockReturnValue(new Date("2026-10-21T10:00:00Z"));
  mocked.deleteWallet.mockResolvedValue({ id: "wallet-a" });
});

describe("delete wallet route", () => {
  const params = { params: Promise.resolve({ id: "wallet-a" }) };
  const request = (origin?: string) => new NextRequest("http://localhost:3002/api/v1/wallets/wallet-a", {
    method: "DELETE", ...(origin ? { headers: { origin } } : {}),
  });

  it("requires same-origin mutation requests", async () => {
    expect((await deleteWalletRoute(request(), params)).status).toBe(403);
    expect((await deleteWalletRoute(request("https://other.example"), params)).status).toBe(403);
    expect(mocked.deleteWallet).not.toHaveBeenCalled();
  });

  it("deletes only in the authenticated workspace and returns private response", async () => {
    const response = await deleteWalletRoute(request("http://localhost:3002"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocked.deleteWallet).toHaveBeenCalledWith({ workspaceId: "owned-workspace", userId: "member" }, "wallet-a");
    expect((await response.json()).data).toEqual({ id: "wallet-a" });
  });

  it("rejects unauthenticated deletion", async () => {
    const { HttpError } = await import("@/server/context");
    mocked.requireContext.mockRejectedValue(new HttpError(401, "UNAUTHENTICATED", "Sign in required"));
    expect((await deleteWalletRoute(request("http://localhost:3002"), params)).status).toBe(401);
    expect(mocked.deleteWallet).not.toHaveBeenCalled();
  });

  it("passes a conflict response for an in-use wallet", async () => {
    const { HttpError } = await import("@/server/context");
    mocked.deleteWallet.mockRejectedValue(new HttpError(409, "WALLET_IN_USE", "Lưu trữ ví"));
    const response = await deleteWalletRoute(request("http://localhost:3002"), params);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("WALLET_IN_USE");
  });
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
