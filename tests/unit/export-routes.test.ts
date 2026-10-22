import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { GET as csvGet } from "@/app/api/v1/exports/transactions.csv/route";
import { GET as xlsxGet } from "@/app/api/v1/exports/reports.xlsx/route";
import { GET as pdfGet } from "@/app/api/v1/exports/reports.pdf/route";
import { POST as reportPost } from "@/app/api/v1/exports/reports/route";
import { GET as importErrorsGet } from "@/app/api/v1/imports/[id]/errors.csv/route";

const mocked = vi.hoisted(() => ({
  requireContext: vi.fn(), transactionsCsv: vi.fn(), sendExport: vi.fn(),
  findBatch: vi.fn(), findRows: vi.fn(), assertSameOrigin: vi.fn(),
}));

vi.mock("@/server/context", () => ({
  requireContext: mocked.requireContext,
  HttpError: class HttpError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));
vi.mock("@/server/csv-export", () => ({ transactionsCsv: mocked.transactionsCsv }));
vi.mock("@/server/export-http", () => ({ sendExport: mocked.sendExport }));
vi.mock("@/server/http", async (importOriginal) => ({ ...await importOriginal<typeof import("@/server/http")>(),
  assertSameOrigin: mocked.assertSameOrigin }));
vi.mock("@/lib/db", () => ({ prisma: { importBatch: { findFirst: mocked.findBatch }, importRow: { findMany: mocked.findRows } } }));

function request(path: string) {
  return new NextRequest(`http://localhost:3002/api/v1/${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.requireContext.mockResolvedValue({ workspaceId: "workspace-a", userId: "user-a", name: "A", image: null });
  mocked.transactionsCsv.mockResolvedValue({ content: "\uFEFFid\r\na1\r\n", count: 1,
    period: { start: "2026-10-01", endExclusive: "2026-11-01" } });
  mocked.sendExport.mockResolvedValue(new Response("fixture export", { headers: { "Cache-Control": "private, no-store" } }));
});

describe("authenticated export HTTP boundaries", () => {
  it("uses the session workspace for CSV, even if a query provides another workspace", async () => {
    const response = await csvGet(request("exports/transactions.csv?workspaceId=workspace-b&walletId=foreign-wallet&start=2026-10-01&endExclusive=2026-11-01"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Finova-Row-Count")).toBe("1");
    expect(mocked.transactionsCsv).toHaveBeenCalledExactlyOnceWith("workspace-a", {
      start: "2026-10-01", endExclusive: "2026-11-01", walletId: "foreign-wallet", categoryId: null,
    });
  });

  it.each([["xlsx", xlsxGet], ["pdf", pdfGet]] as const)("uses session workspace for %s", async (format, handler) => {
    const response = await handler(request(`exports/reports.${format}?workspaceId=workspace-b&categoryId=foreign-category`));
    expect(response.status).toBe(200);
    expect(mocked.sendExport).toHaveBeenCalledExactlyOnceWith("workspace-a", format, {
      start: null, endExclusive: null, walletId: null, categoryId: "foreign-category",
    });
  });

  it.each([
    ["csv", csvGet, "exports/transactions.csv"],
    ["xlsx", xlsxGet, "exports/reports.xlsx"],
    ["pdf", pdfGet, "exports/reports.pdf"],
  ] as const)("returns 401 and no-store for unauthenticated %s", async (_format, handler, path) => {
    mocked.requireContext.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED", "Sign in required"));
    const response = await handler(request(path));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocked.sendExport).not.toHaveBeenCalled();
    expect(mocked.transactionsCsv).not.toHaveBeenCalled();
  });

  it.each([
    ["csv", csvGet, "exports/transactions.csv"],
    ["xlsx", xlsxGet, "exports/reports.xlsx"],
    ["pdf", pdfGet, "exports/reports.pdf"],
  ] as const)("returns a private 404 when the %s export service rejects a foreign filter", async (format, handler, path) => {
    const denied = new HttpError(404, "NOT_FOUND", "Ví không thuộc tài khoản của bạn.");
    if (format === "csv") mocked.transactionsCsv.mockRejectedValueOnce(denied);
    else mocked.sendExport.mockRejectedValueOnce(denied);
    const response = await handler(request(`${path}?walletId=workspace-b-wallet`));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("returns 401 before looking up an import errors batch", async () => {
    mocked.requireContext.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED", "Sign in required"));
    const response = await importErrorsGet(request("imports/batch-a/errors.csv"), { params: Promise.resolve({ id: "batch-a" }) });
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocked.findBatch).not.toHaveBeenCalled();
    expect(mocked.findRows).not.toHaveBeenCalled();
  });

  it("handles an async foreign-filter denial in POST report exports within its error boundary", async () => {
    mocked.sendExport.mockRejectedValueOnce(new HttpError(404, "NOT_FOUND", "Danh mục không thuộc tài khoản của bạn."));
    const post = new NextRequest("http://localhost:3002/api/v1/exports/reports", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3002" },
      body: JSON.stringify({ format: "xlsx", categoryId: "workspace-b-category" }),
    });
    const response = await reportPost(post);
    expect(mocked.assertSameOrigin).toHaveBeenCalledWith(post);
    expect(mocked.sendExport).toHaveBeenCalledExactlyOnceWith("workspace-a", "xlsx", { categoryId: "workspace-b-category" });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("blocks foreign import error CSV before reading its rows", async () => {
    mocked.findBatch.mockResolvedValueOnce(null);
    const response = await importErrorsGet(request("imports/batch-b/errors.csv"), { params: Promise.resolve({ id: "batch-b" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocked.findBatch).toHaveBeenCalledWith({ where: { id: "batch-b", workspaceId: "workspace-a" } });
    expect(mocked.findRows).not.toHaveBeenCalled();
  });

  it("scopes import errors rows and escapes spreadsheet formulas in CSV", async () => {
    mocked.findBatch.mockResolvedValueOnce({ id: "batch-a" });
    mocked.findRows.mockResolvedValueOnce([{ rowNumber: 2, status: "INVALID", error: "invalid amount",
      occurredAt: null, kind: "EXPENSE", amount: null, note: "  =HYPERLINK(bad)" }]);
    const response = await importErrorsGet(request("imports/batch-a/errors.csv"), { params: Promise.resolve({ id: "batch-a" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocked.findRows).toHaveBeenCalledWith({ where: {
      batchId: "batch-a", workspaceId: "workspace-a", status: { in: ["INVALID", "FAILED", "DUPLICATE"] },
    }, orderBy: { rowNumber: "asc" } });
    expect(await response.text()).toContain("'  =HYPERLINK(bad)");
  });
});
