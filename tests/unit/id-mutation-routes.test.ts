import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PATCH as walletPatch } from "@/app/api/v1/wallets/[id]/route";
import { PATCH as categoryPatch } from "@/app/api/v1/categories/[id]/route";
import { PATCH as budgetPatch } from "@/app/api/v1/budgets/[id]/route";
import { PATCH as goalPatch } from "@/app/api/v1/goals/[id]/route";
import { PATCH as notificationPatch } from "@/app/api/v1/notifications/[id]/route";
import { PATCH as cardPatch } from "@/app/api/v1/cards/[id]/route";
import { PATCH as debtPatch } from "@/app/api/v1/debts/[id]/route";
import { PATCH as transactionPatch, DELETE as transactionDelete } from "@/app/api/v1/transactions/[id]/route";
import { PATCH as recurringPatch } from "@/app/api/v1/recurring/[id]/route";
import { POST as allocationPost } from "@/app/api/v1/goals/[id]/allocations/route";
import { POST as debtPaymentPost } from "@/app/api/v1/debts/[id]/payments/route";
import { POST as cardEntryPost } from "@/app/api/v1/cards/[id]/entries/route";
import { POST as recurringConfirmPost } from "@/app/api/v1/recurring/[id]/confirm/route";
import { POST as recurringSkipPost } from "@/app/api/v1/recurring/[id]/skip/route";
import { POST as importRetryPost } from "@/app/api/v1/imports/[id]/retry/route";
import { GET as importGet } from "@/app/api/v1/imports/[id]/route";
import { POST as refundPost } from "@/app/api/v1/transactions/[id]/refunds/route";

const mocked = vi.hoisted(() => ({
  requireContext: vi.fn(), assertSameOrigin: vi.fn(),
  updateWallet: vi.fn(), updateCategory: vi.fn(), updateBudget: vi.fn(),
  updateGoal: vi.fn(), markNotification: vi.fn(), updateCreditCard: vi.fn(),
  updateDebt: vi.fn(), editTransaction: vi.fn(), voidTransaction: vi.fn(), updateRule: vi.fn(),
  allocateGoal: vi.fn(), payDebt: vi.fn(), createCardEntry: vi.fn(),
  processOccurrence: vi.fn(), skipOccurrence: vi.fn(), retryFailedImport: vi.fn(),
  getImport: vi.fn(), refundTransaction: vi.fn(),
}));

vi.mock("@/server/context", () => ({
  requireContext: mocked.requireContext,
  HttpError: class HttpError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));
vi.mock("@/server/http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/http")>(),
  assertSameOrigin: mocked.assertSameOrigin,
}));
vi.mock("@/server/ledger", () => ({
  updateWallet: mocked.updateWallet, editTransaction: mocked.editTransaction, voidTransaction: mocked.voidTransaction,
  refundTransaction: mocked.refundTransaction,
}));
vi.mock("@/server/categories", () => ({ updateCategory: mocked.updateCategory }));
vi.mock("@/server/budgets", () => ({ updateBudget: mocked.updateBudget }));
vi.mock("@/server/goals", () => ({ updateGoal: mocked.updateGoal, allocateGoal: mocked.allocateGoal }));
vi.mock("@/server/notifications", () => ({ markNotification: mocked.markNotification }));
vi.mock("@/server/credit-cards", () => ({ updateCreditCard: mocked.updateCreditCard, createCardEntry: mocked.createCardEntry }));
vi.mock("@/server/debts", () => ({ updateDebt: mocked.updateDebt, payDebt: mocked.payDebt }));
vi.mock("@/server/recurring", () => ({ updateRule: mocked.updateRule, processOccurrence: mocked.processOccurrence, skipOccurrence: mocked.skipOccurrence }));
vi.mock("@/server/imports", () => ({ retryFailedImport: mocked.retryFailedImport, getImport: mocked.getImport }));

const routes = [
  ["wallet", "PATCH", walletPatch, mocked.updateWallet],
  ["category", "PATCH", categoryPatch, mocked.updateCategory],
  ["budget", "PATCH", budgetPatch, mocked.updateBudget],
  ["goal", "PATCH", goalPatch, mocked.updateGoal],
  ["notification", "PATCH", notificationPatch, mocked.markNotification],
  ["card", "PATCH", cardPatch, mocked.updateCreditCard],
  ["debt", "PATCH", debtPatch, mocked.updateDebt],
  ["transaction", "PATCH", transactionPatch, mocked.editTransaction],
  ["transaction", "DELETE", transactionDelete, mocked.voidTransaction],
  ["recurring", "PATCH", recurringPatch, mocked.updateRule],
] as const;

const nestedRoutes = [
  ["goal allocation", "goals/foreign-id/allocations", "POST", allocationPost, mocked.allocateGoal],
  ["debt payment", "debts/foreign-id/payments", "POST", debtPaymentPost, mocked.payDebt],
  ["card entry", "cards/foreign-id/entries", "POST", cardEntryPost, mocked.createCardEntry],
  ["recurring confirm", "recurring/foreign-id/confirm", "POST", recurringConfirmPost, mocked.processOccurrence],
  ["recurring skip", "recurring/foreign-id/skip", "POST", recurringSkipPost, mocked.skipOccurrence],
  ["import retry", "imports/foreign-id/retry", "POST", importRetryPost, mocked.retryFailedImport],
  ["import read", "imports/foreign-id", "GET", importGet, mocked.getImport],
  ["transaction refund", "transactions/foreign-id/refunds", "POST", refundPost, mocked.refundTransaction],
] as const;

function nestedRequest(path: string, method: "GET" | "POST") {
  return new NextRequest(`http://localhost:3002/api/v1/${path}?workspaceId=workspace-b`, {
    method,
    ...(method === "POST" ? {
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3002", "Idempotency-Key": "test-idempotency" },
      body: JSON.stringify({ workspaceId: "workspace-b", amount: "1000", note: "test" }),
    } : {}),
  });
}

function request(kind: string, method: "PATCH" | "DELETE") {
  const suffix = method === "DELETE" ? "?version=1&workspaceId=workspace-b" : "?workspaceId=workspace-b";
  const path = kind === "category" ? "categories" : kind === "recurring" ? "recurring" : `${kind}s`;
  return new NextRequest(`http://localhost:3002/api/v1/${path}/foreign-id${suffix}`, {
    method,
    ...(method === "PATCH" ? {
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3002" },
      body: JSON.stringify(kind === "notification" ? { read: true } : { workspaceId: "workspace-b", name: "test" }),
    } : { headers: { Origin: "http://localhost:3002" } }),
  });
}

const context = { userId: "user-a", workspaceId: "workspace-a", name: "A", image: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.assertSameOrigin.mockImplementation(() => undefined);
  mocked.requireContext.mockResolvedValue(context);
  for (const [, , , service] of routes) service.mockResolvedValue({ id: "foreign-id" });
  for (const [, , , , service] of nestedRoutes) service.mockResolvedValue({ id: "foreign-id" });
});

describe("nested-object HTTP boundaries", () => {
  it.each(nestedRoutes)("%s resolves target ID in the authenticated workspace", async (name, path, method, handler, service) => {
    const response = await handler(nestedRequest(path, method), { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(method === "POST" && ["goal allocation", "debt payment", "card entry", "transaction refund"].includes(name) ? 201 : 200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(service).toHaveBeenCalledOnce();
    expect(service.mock.calls[0][0]).toEqual(name === "import read" ? "workspace-a" : context);
    expect(service.mock.calls[0][1]).toBe("foreign-id");
  });

  it.each(nestedRoutes)("%s refuses unauthenticated access before its service", async (_name, path, method, handler, service) => {
    const { HttpError } = await import("@/server/context");
    mocked.requireContext.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED", "Sign in required"));
    const response = await handler(nestedRequest(path, method), { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(service).not.toHaveBeenCalled();
  });

  it.each(nestedRoutes)("%s maps a foreign target to private 404", async (_name, path, method, handler, service) => {
    const { HttpError } = await import("@/server/context");
    service.mockRejectedValueOnce(new HttpError(404, "NOT_FOUND", "Foreign target"));
    const response = await handler(nestedRequest(path, method), { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it.each(nestedRoutes.filter(([, , method]) => method === "POST"))("%s stops on a rejected Origin before calling services", async (_name, path, method, handler, service) => {
    const { HttpError } = await import("@/server/context");
    mocked.assertSameOrigin.mockImplementationOnce(() => { throw new HttpError(403, "INVALID_ORIGIN", "Cross origin"); });
    const response = await handler(nestedRequest(path, method), { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(403);
    expect(mocked.requireContext).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
  });

  it.each(["goal allocation", "debt payment", "card entry", "transaction refund"])("forwards an idempotency key for %s", async (name) => {
    const [, path, method, handler, service] = nestedRoutes.find(([label]) => label === name)!;
    await handler(nestedRequest(path, method), { params: Promise.resolve({ id: "foreign-id" }) });
    expect(service.mock.calls[0][3]).toBe("test-idempotency");
  });
});

describe("object-ID mutation HTTP boundaries", () => {
  it.each(routes.filter(([, method]) => method === "PATCH"))("%s rejects invalid JSON at its mutation boundary", async (kind, method, handler, service) => {
    const valid = request(kind, method);
    const invalid = new NextRequest(valid.url, {
      method: "PATCH", headers: { Origin: "http://localhost:3002", "Content-Type": "application/json" }, body: "{",
    });
    const response = await handler(invalid, { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(service).not.toHaveBeenCalled();
  });

  it("rejects oversized JSON before mutating a wallet", async () => {
    const huge = new NextRequest("http://localhost:3002/api/v1/wallets/foreign-id", {
      method: "PATCH", headers: { Origin: "http://localhost:3002", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "a".repeat(65_536) }),
    });
    const response = await walletPatch(huge, { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "SIZE" } });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocked.updateWallet).not.toHaveBeenCalled();
  });

  it("returns private 400 for malformed JSON without invoking the wallet service", async () => {
    const malformed = new NextRequest("http://localhost:3002/api/v1/wallets/foreign-id", {
      method: "PATCH", headers: { Origin: "http://localhost:3002", "Content-Type": "application/json" }, body: "{",
    });
    const response = await walletPatch(malformed, { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
    expect(mocked.updateWallet).not.toHaveBeenCalled();
  });

  it.each(["", "0", "-1", "1.5", "not-a-number", "9007199254740992"])("rejects invalid transaction void version %s with 400", async (version) => {
    const url = new NextRequest(`http://localhost:3002/api/v1/transactions/foreign-id?version=${version}`, {
      method: "DELETE", headers: { Origin: "http://localhost:3002" },
    });
    const response = await transactionDelete(url, { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(mocked.voidTransaction).not.toHaveBeenCalled();
  });

  it.each(routes)("%s %s sends URL object ID and authenticated workspace to its service", async (kind, method, handler, service) => {
    const response = await handler(request(kind, method), { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(service).toHaveBeenCalledOnce();
    expect(service.mock.calls[0][0]).toEqual(kind === "notification" ? "workspace-a" : context);
    expect(service.mock.calls[0][1]).toBe("foreign-id");
  });

  it.each(routes)("%s %s returns private 401 before calling its service", async (kind, method, handler, service) => {
    const { HttpError } = await import("@/server/context");
    mocked.requireContext.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED", "Sign in required"));
    const response = await handler(request(kind, method), { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(service).not.toHaveBeenCalled();
  });

  it.each(routes)("%s %s maps foreign-object denial to private 404", async (kind, method, handler, service) => {
    const { HttpError } = await import("@/server/context");
    service.mockRejectedValueOnce(new HttpError(404, "NOT_FOUND", "Foreign object"));
    const response = await handler(request(kind, method), { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it.each(routes)("%s %s refuses a rejected Origin before authentication and mutation", async (kind, method, handler, service) => {
    const { HttpError } = await import("@/server/context");
    mocked.assertSameOrigin.mockImplementationOnce(() => { throw new HttpError(403, "INVALID_ORIGIN", "Cross origin"); });
    const response = await handler(request(kind, method), { params: Promise.resolve({ id: "foreign-id" }) });
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocked.requireContext).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
  });
});
