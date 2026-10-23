import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/v1/bank-sync/connections/[id]/sync/route";
import { HttpError } from "@/server/context";

const mocks = vi.hoisted(() => ({ requireContext: vi.fn(), sync: vi.fn() }));
vi.mock("@/server/context", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/context")>(), requireContext: mocks.requireContext,
}));
vi.mock("@/modules/bank-sync/sepay/service", () => ({ syncSePayHistory: mocks.sync }));

const context = { userId: "user-one", workspaceId: "workspace-one", name: "One", image: null };
function request(origin = "http://localhost:3002", body = JSON.stringify({ from: "2026-10-21", to: "2026-10-22" })) {
  return new NextRequest("http://localhost:3002/api/v1/bank-sync/connections/connection-one/sync?workspaceId=foreign", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body,
  });
}
const params = { params: Promise.resolve({ id: "connection-one" }) };

describe("SePay manual sync HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContext.mockResolvedValue(context);
    mocks.sync.mockResolvedValue({ accepted: 0, duplicates: 2, jobId: "job-one" });
  });

  it("uses session workspace and URL connection id, ignoring foreign workspace query", async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.requireContext).toHaveBeenCalledOnce();
    expect(mocks.sync).toHaveBeenCalledWith(context, "connection-one", "2026-10-21", "2026-10-22");
  });

  it("requires a session and rejects before provider sync", async () => {
    mocks.requireContext.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED", "Sign in required"));
    const response = await POST(request(), params);
    expect(response.status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it.each(["https://attacker.invalid", "null"])("rejects cross-site Origin %s before session resolution", async origin => {
    const response = await POST(request(origin), params);
    expect(response.status).toBe(403);
    expect(mocks.requireContext).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("rejects missing Origin and malformed or over-scoped input", async () => {
    const noOrigin = request();
    noOrigin.headers.delete("origin");
    expect((await POST(noOrigin, params)).status).toBe(403);
    const invalid = await POST(request("http://localhost:3002", JSON.stringify({ from: "2026-10-21", to: "2026-10-22", workspaceId: "foreign" })), params);
    expect(invalid.status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("does not expose foreign connection details on service denial", async () => {
    mocks.sync.mockRejectedValueOnce(new HttpError(404, "SEPAY_CONNECTION_MISSING", "Not found"));
    const response = await POST(request(), params);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "SEPAY_CONNECTION_MISSING" } });
  });
});
