import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pageContext: vi.fn(), effective: vi.fn(), prices: vi.fn(), orders: vi.fn(), notices: vi.fn(), registrations: vi.fn(), role: vi.fn(),
}));

vi.mock("@/server/page-context", () => ({ requirePageContext: mocks.pageContext }));
vi.mock("@/server/premium", () => ({ getEffectiveSubscription: mocks.effective }));
vi.mock("@/modules/billing/service", () => ({
  getPublishedPrices: mocks.prices, listBillingOrders: mocks.orders, checkoutEnabled: () => false,
}));
vi.mock("@/lib/db", () => ({ prisma: { billingNotice: { findMany: mocks.notices },
  subscriptionActionRequest: { findMany: mocks.registrations }, systemRoleAssignment: { findFirst: mocks.role } } }));
vi.mock("@/components/premium-period-cards", () => ({ PremiumPeriodCards: () => createElement("div", null, "Hai kỳ hạn Premium") }));
vi.mock("@/components/premium-registration-form", () => ({ PremiumRegistrationForm: () => createElement("div", null, "Đăng ký Premium") }));

import SubscriptionPage from "../../src/app/(protected)/settings/subscription/page";

const createdAt = new Date("2026-10-24T10:00:00Z");
const paidAt = new Date("2026-10-24T10:10:00Z");
const activatedAt = new Date("2026-10-24T10:11:00Z");
const expiresAt = new Date("2026-10-25T10:00:00Z");
const originalAdminFlag = process.env.FINOVA_ADMIN_ENABLED;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.pageContext.mockResolvedValue({ userId: "lite-user" });
  mocks.effective.mockResolvedValue({ plan: "LITE", expiresAt: null });
  mocks.prices.mockResolvedValue([]);
  mocks.notices.mockResolvedValue([]);
  mocks.registrations.mockResolvedValue([]);
  mocks.orders.mockResolvedValue([]);
  mocks.role.mockResolvedValue(null);
});

afterEach(() => {
  if (originalAdminFlag === undefined) delete process.env.FINOVA_ADMIN_ENABLED;
  else process.env.FINOVA_ADMIN_ENABLED = originalAdminFlag;
});

describe("subscription history displays verified order lifecycle", () => {
  it("shows self-registration only to ordinary Lite accounts when admin is enabled", async () => {
    process.env.FINOVA_ADMIN_ENABLED = "1";
    const ordinary = renderToStaticMarkup(await SubscriptionPage());
    expect(ordinary).toContain("Gửi yêu cầu Premium");
    expect(ordinary).toContain("Đăng ký Premium");
    expect(mocks.role).toHaveBeenCalledWith({
      where: { userId: "lite-user", revokedAt: null }, select: { id: true },
    });

    mocks.role.mockResolvedValue({ id: "active-admin-role" });
    const privileged = renderToStaticMarkup(await SubscriptionPage());
    expect(privileged).toContain("Tài khoản có vai trò quản trị hệ thống");
    expect(privileged).not.toContain("Gửi yêu cầu Premium");

    mocks.effective.mockResolvedValue({ plan: "PREMIUM", expiresAt: null });
    const superAdmin = renderToStaticMarkup(await SubscriptionPage());
    expect(superAdmin).toContain("Premium dành cho Super Admin");
    expect(superAdmin).not.toContain("Gửi yêu cầu Premium");
    expect(mocks.role).toHaveBeenCalledTimes(2);
  });
  it("lets Lite users inspect every order stage without requiring Premium notification access", async () => {
    mocks.orders.mockResolvedValue([
      { id: "pending", orderCode: "FNV-PENDING", period: "MONTH", amountVnd: 29000,
        status: "PENDING_PAYMENT", createdAt, expiresAt, paidAt: null, activatedAt: null },
      { id: "paid", orderCode: "FNV-PAID", period: "YEAR", amountVnd: 199000,
        status: "PAID", createdAt, expiresAt, paidAt, activatedAt: null },
      { id: "active", orderCode: "FNV-ACTIVE", period: "MONTH", amountVnd: 29000,
        status: "PAID", createdAt, expiresAt, paidAt, activatedAt },
      { id: "review", orderCode: "FNV-REVIEW", period: "MONTH", amountVnd: 29000,
        status: "REVIEW", createdAt, expiresAt, paidAt: null, activatedAt: null },
      { id: "refunded", orderCode: "FNV-REFUNDED", period: "YEAR", amountVnd: 199000,
        status: "REFUNDED", createdAt, expiresAt, paidAt, activatedAt },
    ]);
    const html = renderToStaticMarkup(await SubscriptionPage());
    expect(html).toContain("Finova Lite");
    expect(html).toContain("Chờ xác minh tiền vào");
    expect(html).toContain("Đã nhận tiền, chờ kích hoạt");
    expect(html).toContain("Đã kích hoạt Premium");
    expect(html).toContain("Cần đối soát tiền vào");
    expect(html).toContain("Từng kích hoạt Premium");
    expect(html).toContain("Đã hoàn tiền");
    expect((html.match(/<details class="subscription-order-details"/g) ?? [])).toHaveLength(5);
    expect(html).toContain("/billing/checkout/refunded");
    expect(mocks.orders).toHaveBeenCalledWith("lite-user");
    expect(mocks.effective).toHaveBeenCalledWith("lite-user");
    expect(mocks.notices).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "lite-user" } }));
  });

  it("shows the current effective plan separately from a historically activated order", async () => {
    mocks.effective.mockResolvedValue({ plan: "PREMIUM", expiresAt });
    mocks.orders.mockResolvedValue([{ id: "past", orderCode: "FNV-OLD", period: "MONTH", amountVnd: 29000,
      status: "REFUNDED", createdAt, expiresAt, paidAt, activatedAt }]);
    const html = renderToStaticMarkup(await SubscriptionPage());
    expect(html).toContain("Premium có hiệu lực đến");
    expect(html).toContain("Từng kích hoạt Premium");
    expect(html).toContain("Đã hoàn tiền");
    expect(html).toContain("Lịch sử đơn hàng gần đây");
  });
});
