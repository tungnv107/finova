import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as importPost } from "@/app/api/v1/imports/ai/route";
import { POST as classifyPost } from "@/app/api/v1/ai/classify/route";
import { GET as insightsGet, POST as insightsPost } from "@/app/api/v1/ai/insights/route";
const mocks = vi.hoisted(() => ({ requireContext: vi.fn(), premium: vi.fn(), origin: vi.fn(), preview: vi.fn(), classify: vi.fn(), insights: vi.fn(), explain: vi.fn() }));
vi.mock("@/server/context", async importOriginal => ({ ...await importOriginal<typeof import("@/server/context")>(), requireContext: mocks.requireContext }));
vi.mock("@/server/premium", () => ({ requireStatementImportContext: mocks.premium }));
vi.mock("@/server/http", async importOriginal => ({ ...await importOriginal<typeof import("@/server/http")>(), assertSameOrigin: mocks.origin }));
vi.mock("@/server/ai/statements", () => ({ previewAiStatement: mocks.preview }));
vi.mock("@/server/ai/classification", () => ({ suggestCategory: mocks.classify }));
vi.mock("@/server/ai/insights", () => ({ getFinancialIntelligence: mocks.insights, explainFinancialIntelligence: mocks.explain }));
import { HttpError } from "@/server/context";
beforeEach(() => { vi.resetAllMocks(); mocks.requireContext.mockResolvedValue({ userId: "u", workspaceId: "ws" }); mocks.premium.mockResolvedValue({ userId: "u", workspaceId: "ws" }); });
describe("P0 HTTP boundaries", () => {
  it("requires a signed session before reading insights", async () => {
    mocks.requireContext.mockRejectedValue(new HttpError(401, "UNAUTHENTICATED", "login"));
    expect((await insightsGet(new NextRequest("http://localhost/api/v1/ai/insights"))).status).toBe(401); expect(mocks.insights).not.toHaveBeenCalled();
  });
  it("requires origin before invoking expensive AI", async () => {
    mocks.origin.mockImplementation(() => { throw new HttpError(403, "ORIGIN", "origin"); });
    expect((await insightsPost(new NextRequest("http://localhost/api/v1/ai/insights", { method: "POST" }))).status).toBe(403); expect(mocks.explain).not.toHaveBeenCalled();
  });
  it("keeps imports premium protected", async () => {
    mocks.premium.mockRejectedValue(new HttpError(403, "PREMIUM_REQUIRED", "premium"));
    expect((await importPost(new NextRequest("http://localhost/api/v1/imports/ai", { method: "POST" }))).status).toBe(403); expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("rejects missing upload consent", async () => {
    const form = new FormData(); form.append("file", new File(["%PDF-1.4"], "a.pdf")); form.append("walletId", "wallet");
    expect((await importPost(new NextRequest("http://localhost/api/v1/imports/ai", { method: "POST", body: form }))).status).toBe(400); expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("does not let clients supply another workspace", async () => {
    const r = await classifyPost(new NextRequest("http://localhost/api/v1/ai/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "Coffee", kind: "EXPENSE", workspaceId: "foreign" }) }));
    expect(r.status).toBe(400); expect(mocks.classify).not.toHaveBeenCalled();
  });
  it("returns no-store aggregates for the authenticated workspace", async () => {
    mocks.insights.mockResolvedValue({ hasData: false }); const r = await insightsGet(new NextRequest("http://localhost/api/v1/ai/insights"));
    expect(mocks.insights).toHaveBeenCalledWith("ws"); expect(r.headers.get("cache-control")).toContain("no-store");
  });
});
