import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), analytics: vi.fn() }));
vi.mock("../../src/server/admin-page", () => ({ requireAdminPageRole: mocks.role }));
vi.mock("../../src/modules/admin/billing-analytics", () => ({ getBillingAnalytics: mocks.analytics }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) =>
  createElement("a", { href }, children) }));

import BillingAnalyticsPage from "../../src/app/(admin-portal)/admin/billing/analytics/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ role: "FINANCE_OPERATOR" });
  mocks.analytics.mockResolvedValue({ days: 7, fromVn: "2026-10-19", untilVn: "2026-10-25",
    totals: { orders: 2, paidFromOrders: 1, activatedFromOrders: 1, createdToPaidRate: 0.5, createdToActivatedRate: 0.5,
      monthlyOrders: 1, yearlyOrders: 1,
      paidGrants: 1, renewals: 0, expiredUsers: 1, grossVnd: "29000", allocatedCount: 1,
      paidUsers: 1, firstPaidUsers: 1, renewingUsers: 0, monthlyGrants: 1, yearlyGrants: 0,
      verifiedEvents: 1, exceptions: 0, unresolvedEvents: 0, refundedOrderCohort: 0,
      reviewIncomingVnd: "29000", reviewIncomingCount: 1 },
    rows: [{ day: "2026-10-25", orders: 2, paidFromOrders: 1, activatedFromOrders: 1,
      paidGrants: 1, renewals: 0, expiredUsers: 1, allocatedCount: 1,
      grossVnd: "29000", exceptions: 0, reviewIncomingVnd: "29000" }],
  });
});

describe("finance-only billing analytics dashboard", () => {
  it("checks signed role first, renders source definitions and period drill-down without PII", async () => {
    const html = renderToStaticMarkup(await BillingAnalyticsPage({ searchParams: Promise.resolve({ days: "7" }) }));
    expect(mocks.role).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"]);
    expect(mocks.analytics).toHaveBeenCalledWith(7);
    expect(html).toContain("Phân tích thu phí Premium");
    expect(html).toContain("29.000");
    expect(html).toContain("50.0%");
    expect(html).toContain("/admin/billing/analytics?days=90");
    expect(html).toContain("chưa trừ hoàn tiền");
    expect(html).toContain("NGƯỜI ĐƯỢC CẤP PREMIUM TRẢ PHÍ");
    expect(html).toContain("GIÁ TRỊ ĐẦU VÀO CHỜ ĐỐI SOÁT");
    expect(html).not.toMatch(/userId|orderId|providerTransactionId/);
    mocks.role.mockRejectedValueOnce(new Error("FORBIDDEN"));
    mocks.analytics.mockClear();
    await expect(BillingAnalyticsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("FORBIDDEN");
    expect(mocks.analytics).not.toHaveBeenCalled();
  });
  it("handles database errors without exposing exception details", async () => {
    mocks.analytics.mockRejectedValueOnce(new Error("connection password XYZ"));
    const html = renderToStaticMarkup(await BillingAnalyticsPage({ searchParams: Promise.resolve({ days: "invalid" }) }));
    expect(mocks.analytics).toHaveBeenCalledWith(7);
    expect(html).toContain("Không tải được phân tích thu phí");
    expect(html).not.toContain("connection password XYZ");
  });
});
