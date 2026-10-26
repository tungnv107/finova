import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  counts: vi.fn(), events: vi.fn(), actions: vi.fn(),
  requireRole: vi.fn(), summary: vi.fn(), lifecycle: vi.fn(),
}));
vi.mock("../../src/lib/db", () => ({ prisma: {
  subscriptionActionRequest: { count: mocks.counts, findMany: mocks.actions },
  subscriptionGrant: { count: mocks.counts },
  subscriptionEvent: { findMany: mocks.events },
} }));
vi.mock("../../src/server/admin-page", () => ({ requireAdminPageRole: mocks.requireRole }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) =>
  createElement("a", { href }, children) }));

import { getSubscriptionOperations, listSubscriptionActionPage, listSubscriptionLifecycle } from "../../src/modules/billing/manual-subscriptions";
import AdminSubscriptionActionsPage from "../../src/app/(protected)/admin/subscriptions/page";

const date = new Date("2026-10-24T10:00:00.000Z");
const event = (id: string) => ({ id, userId: "member-1", kind: "MANUAL_ACTIVATED", orderId: null,
  actionRequestId: "request-1", createdAt: date, startsAt: date, expiresAt: new Date("2026-11-24T10:00:00Z") });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.counts.mockResolvedValue(2);
  mocks.events.mockResolvedValue([event("event-1")]);
  mocks.actions.mockResolvedValue([]);
  mocks.requireRole.mockResolvedValue({ role: "SUPER_ADMIN", userId: "root-2" });
});

describe("subscription operations dashboard", () => {
  it("paginates the review queue across equal-time requests and ties the cursor to its status", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `request-${String(i).padStart(3, "0")}`, createdAt: date, userId: "member-1",
      kind: "MANUAL_GRANT", billingPeriod: "MONTH", status: "PENDING",
    }));
    mocks.actions.mockResolvedValueOnce(rows);
    const first = await listSubscriptionActionPage("PENDING");
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    expect(mocks.actions.mock.calls[0][0]).toMatchObject({
      where: { status: "PENDING" }, take: 51,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    mocks.actions.mockResolvedValueOnce([rows[50]]);
    const second = await listSubscriptionActionPage("PENDING", first.nextCursor!);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(mocks.actions.mock.calls[1][0].where).toMatchObject({ status: "PENDING", OR: [
      { createdAt: { lt: date } }, { createdAt: date, id: { lt: "request-049" } },
    ] });
    await expect(listSubscriptionActionPage("APPROVED", first.nextCursor!)).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await expect(listSubscriptionActionPage("PENDING", "bad/1")).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect(mocks.actions).toHaveBeenCalledTimes(2);
  });

  it("counts pending non-expired requests, decisions, and live manual grants separately", async () => {
    expect(await getSubscriptionOperations()).toEqual({ pending: 2, approved: 2, rejected: 2, activeManualGrants: 2 });
    expect(mocks.counts.mock.calls[0][0].where).toMatchObject({ status: "PENDING", expiresAt: { gt: expect.any(Date) } });
    expect(mocks.counts.mock.calls[3][0].where).toMatchObject({ grantType: "MANUAL", revokedAt: null,
      startsAt: { lte: expect.any(Date) }, expiresAt: { gt: expect.any(Date) } });
  });

  it("paginates equal-time events with an opaque timestamp/id keyset cursor and minimal projection", async () => {
    mocks.events.mockResolvedValueOnce(Array.from({ length: 51 }, (_, index) => event(`event-${index + 1}`)));
    const first = await listSubscriptionLifecycle();
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8"))).toEqual({
      v: 1, at: date.toISOString(), id: "event-50",
    });
    expect(mocks.events.mock.calls[0][0]).toMatchObject({ take: 51,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { userId: true, kind: true, createdAt: true, startsAt: true, expiresAt: true } });
    expect(Object.keys(mocks.events.mock.calls[0][0].select)).not.toContain("reason");
    mocks.events.mockResolvedValueOnce([event("event-51")]);
    const next = await listSubscriptionLifecycle(first.nextCursor!);
    expect(next.nextCursor).toBeNull();
    expect(mocks.events.mock.calls[1][0]).toMatchObject({ where: { OR: [
      { createdAt: { lt: date } }, { createdAt: date, id: { lt: "event-50" } },
    ] } });
    await expect(listSubscriptionLifecycle("bad cursor/?")).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    const malformed = Buffer.from(JSON.stringify({ v: 1, at: "not-a-date", id: "event-50" })).toString("base64url");
    await expect(listSubscriptionLifecycle(malformed)).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect(mocks.events).toHaveBeenCalledTimes(2);
  });

  it("authorizes before all DB reads and renders an accessible operations/history view", async () => {
    mocks.actions.mockResolvedValueOnce([]);
    const markup = renderToStaticMarkup(await AdminSubscriptionActionsPage({ searchParams: Promise.resolve({ status: "PENDING" }) }));
    expect(mocks.requireRole).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN"]);
    expect(markup).toContain("CHỜ PHÊ DUYỆT CÒN HẠN");
    expect(markup).toContain("Lịch sử cấp quyền và gia hạn");
    expect(markup).toContain("Duyệt cấp bù");
    expect(markup).not.toContain("Đơn đã xác minh");
    expect(markup).toContain("Phê duyệt nội bộ");
    expect(markup).not.toContain("bankAccountNumber");
    vi.resetAllMocks();
    mocks.requireRole.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(AdminSubscriptionActionsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("FORBIDDEN");
    expect(mocks.counts).not.toHaveBeenCalled();
    expect(mocks.events).not.toHaveBeenCalled();
  });
});
