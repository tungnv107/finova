import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminPriceVersions } from "../../src/components/admin-price-versions";
import { AdminManualRevoke, AdminSubscriptionDecision } from "../../src/components/admin-subscription-actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const prices = [
  { id: "draft", productCode: "PREMIUM_MONTHLY", version: 2, priceVnd: 29000, lifecycle: "DRAFT", publishedAt: null, effectiveFrom: "2026-10-27", effectiveTo: null },
  { id: "live", productCode: "PREMIUM_MONTHLY", version: 1, priceVnd: 29000, lifecycle: "PUBLISHED", publishedAt: "2026-10-20", effectiveFrom: "2026-10-20", effectiveTo: null },
  { id: "retired", productCode: "PREMIUM_YEARLY", version: 1, priceVnd: 199000, lifecycle: "ARCHIVED", publishedAt: "2026-09-20", effectiveFrom: "2026-09-20", effectiveTo: "2026-10-20" },
];

describe("Premium V4 control hierarchy", () => {
  it("shows the price status as badges, preview as a text action and draft edits only on demand", () => {
    const html = renderToStaticMarkup(createElement(AdminPriceVersions, { prices }));
    expect(html).toContain("v4-status-badge is-success");
    expect(html).toContain("v4-status-badge is-warning");
    expect(html).toContain("Xem trước công bố");
    expect(html).toContain('aria-label="Tác vụ giá phiên bản 2"');
    expect(html).toContain('aria-label="Tác vụ giá phiên bản 1"');
    expect(html).not.toContain("Chỉnh giá nháp");
    expect(html).not.toContain('id="price-draft"');
    expect(html).not.toContain("Xác nhận công bố phiên bản");
  });

  it("keeps reviewer-only decisions collapsed until explicitly opened", () => {
    const allowed = renderToStaticMarkup(createElement(AdminSubscriptionDecision, { id: "request-1", canReview: true }));
    const blocked = renderToStaticMarkup(createElement(AdminSubscriptionDecision, { id: "request-1", canReview: false }));
    expect(allowed).toContain("Xem xét yêu cầu");
    expect(allowed).not.toContain("Phê duyệt");
    expect(allowed).not.toContain("Từ chối");
    expect(blocked).toContain("Cần SUPER_ADMIN khác xem xét");
    expect(blocked).not.toContain("<button");
  });

  it("keeps manual revoke reason fields behind an explicit action", () => {
    const html = renderToStaticMarkup(createElement(AdminManualRevoke, { grantId: "grant-1" }));
    expect(html).toContain("Đề xuất thu hồi");
    expect(html).not.toContain("Lý do thu hồi");
    expect(html).not.toContain('type="submit"');
  });
});
