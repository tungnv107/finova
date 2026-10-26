import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(), alerts: vi.fn(), orders: vi.fn(), audit: vi.fn(),
}));
vi.mock("../../src/server/admin-page", () => ({ requireAdminPageRole: mocks.role }));
vi.mock("../../src/modules/admin/billing-operational-alerts", () => ({ getBillingOperationalAlerts: mocks.alerts }));
vi.mock("../../src/modules/admin/billing-investigation", () => ({
  parseBillingOrderFilter: (value?: string) => value === "PAID" ? value : undefined,
  parseSensitiveAuditAction: (value?: string) => value === "PRICE_PUBLISH" ? value : undefined,
  listBillingOrdersForOperations: mocks.orders, listSensitiveAdminAudit: mocks.audit,
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: {
  href: string; children: React.ReactNode; [key: string]: unknown;
}) => createElement("a", { href, ...props }, children) }));

import BillingOperationsPage from "../../src/app/(protected)/admin/billing/operations/page";
import BillingOrdersPage from "../../src/app/(protected)/admin/billing/orders/page";
import AdminAuditPage from "../../src/app/(protected)/admin/audit/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ role: "ADMIN" });
  mocks.alerts.mockResolvedValue({ checkedAt: new Date("2026-10-25T06:00:00Z"),
    alerts: [{ code: "PAYMENT_DLQ", severity: "critical", count: 2,
      title: "Chờ đối soát", explanation: "Worker dừng.", href: "/admin/billing/payments?review=1" }] });
  mocks.orders.mockResolvedValue({ total: 30, pageSize: 25, orders: [{
    id: "order-id", orderCode: "FNV-TEST", createdAt: new Date("2026-10-25T06:00:00Z"),
    expiresAt: new Date("2026-11-25T06:00:00Z"), paidAt: null, activatedAt: null,
    billingPeriodSnapshot: "MONTH", amountDueVnd: "29000", receiver: "QA · ••••4321",
    status: "PENDING_PAYMENT",
  }] });
  mocks.audit.mockResolvedValue({ total: 1, pageSize: 25, events: [{
    id: "audit-id", action: "PRICE_PUBLISH",
    resourceType: "PlanPrice", createdAt: new Date("2026-10-25T06:00:00Z"),
  }] });
});

describe("new admin billing operational pages", () => {
  it("enforces role before each data read, including Finance vs audit", async () => {
    await BillingOperationsPage();
    await BillingOrdersPage({ searchParams: Promise.resolve({}) });
    await AdminAuditPage({ searchParams: Promise.resolve({}) });
    expect(mocks.role.mock.calls).toEqual([
      [["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"]],
      [["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"]],
      [["SUPER_ADMIN", "ADMIN"]],
    ]);
    mocks.role.mockRejectedValue(new Error("FORBIDDEN"));
    mocks.alerts.mockClear(); mocks.orders.mockClear(); mocks.audit.mockClear();
    await expect(BillingOperationsPage()).rejects.toThrow("FORBIDDEN");
    await expect(BillingOrdersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("FORBIDDEN");
    await expect(AdminAuditPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("FORBIDDEN");
    expect(mocks.alerts).not.toHaveBeenCalled();
    expect(mocks.orders).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("renders aggregate alert, filtered orders, masked receiver and audit without identifiers", async () => {
    const alerts = renderToStaticMarkup(await BillingOperationsPage());
    const orders = renderToStaticMarkup(await BillingOrdersPage({
      searchParams: Promise.resolve({ page: "0", status: "PAID" }),
    }));
    const audit = renderToStaticMarkup(await AdminAuditPage({
      searchParams: Promise.resolve({ page: "0", action: "PRICE_PUBLISH" }),
    }));
    expect(alerts).toContain("PAYMENT_DLQ");
    expect(alerts).toContain("Chờ đối soát");
    expect(orders).toContain("29.000");
    expect(orders).toContain("••••4321");
    expect(orders).toContain("status=PAID&amp;page=1");
    expect(audit).toContain("PRICE_PUBLISH");
    expect(mocks.orders).toHaveBeenCalledWith({ page: 0, status: "PAID" });
    expect(mocks.audit).toHaveBeenCalledWith({ page: 0, action: "PRICE_PUBLISH" });
    expect(alerts + orders + audit).not.toMatch(/userId|actorId|beforeJson|afterJson|accountNumberEncrypted/);
  });

  it("handles empty results and database errors without exposing secrets", async () => {
    mocks.alerts.mockResolvedValueOnce({ checkedAt: new Date(), alerts: [] });
    mocks.orders.mockResolvedValueOnce({ total: 0, pageSize: 25, orders: [] });
    mocks.audit.mockResolvedValueOnce({ total: 0, pageSize: 25, events: [] });
    expect(renderToStaticMarkup(await BillingOperationsPage())).toContain("Chưa thấy tín hiệu");
    expect(renderToStaticMarkup(await BillingOrdersPage({ searchParams: Promise.resolve({}) }))).toContain("Không có đơn");
    expect(renderToStaticMarkup(await AdminAuditPage({ searchParams: Promise.resolve({}) }))).toContain("Chưa có thao tác");
    mocks.alerts.mockRejectedValueOnce(new Error("secret-123"));
    mocks.orders.mockRejectedValueOnce(new Error("secret-123"));
    mocks.audit.mockRejectedValueOnce(new Error("secret-123"));
    const html = [
      renderToStaticMarkup(await BillingOperationsPage()),
      renderToStaticMarkup(await BillingOrdersPage({ searchParams: Promise.resolve({}) })),
      renderToStaticMarkup(await AdminAuditPage({ searchParams: Promise.resolve({}) })),
    ].join("");
    expect(html).toContain("Không đọc được tín hiệu");
    expect(html).toContain("Không tải được danh sách");
    expect(html).toContain("Không tải được nhật ký");
    expect(html).not.toContain("secret-123");
  });
});
