import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PremiumPeriodCards } from "../../src/components/premium-period-cards";
import { billingOrderStatusDescription, billingOrderStatusLabel, formatVietnamDateTime, premiumPeriodOptions } from "../../src/modules/billing/subscription-view";

vi.mock("@/components/premium-checkout-button", () => ({
  PremiumCheckoutButton: ({ available, children }: { available: boolean; children: React.ReactNode }) =>
    createElement("button", { disabled: !available }, children),
}));

const published = [
  { id: "monthly", productCode: "PREMIUM_MONTHLY", billingPeriod: "MONTH", periodCount: 1,
    priceVnd: 29000, currency: "VND", available: true },
  { id: "yearly", productCode: "PREMIUM_YEARLY", billingPeriod: "YEAR", periodCount: 1,
    priceVnd: 199000, currency: "VND", available: true },
];

describe("user subscription options", () => {
  it("shows exactly the agreed two periods and only valid published prices can initiate checkout", () => {
    expect(premiumPeriodOptions(published)).toEqual([
      { productCode: "PREMIUM_MONTHLY", billingPeriod: "MONTH", priceVnd: 29000, priceId: "monthly", available: true },
      { productCode: "PREMIUM_YEARLY", billingPeriod: "YEAR", priceVnd: 199000, priceId: "yearly", available: true },
    ]);
    const html = renderToStaticMarkup(createElement(PremiumPeriodCards, { prices: published, currentPlan: "LITE" }));
    expect(html).toContain("29.000 VNĐ");
    expect(html).toContain("199.000 VNĐ");
    expect(html).toContain("Nâng cấp");
    expect(html).not.toContain("disabled");
  });

  it("displays unavailable periods without generating a checkout from incomplete or corrupt catalog", () => {
    const inputs = [
      { ...published[0], id: "bad", currency: "USD" },
      { ...published[1], id: "bad-year", periodCount: 12 },
    ];
    expect(premiumPeriodOptions(inputs).map(option => [option.priceId, option.available, option.priceVnd]))
      .toEqual([[null, false, 29000], [null, false, 199000]]);
    const html = renderToStaticMarkup(createElement(PremiumPeriodCards, { prices: inputs, currentPlan: "PREMIUM" }));
    expect((html.match(/disabled/g) ?? []).length).toBe(2);
    expect(html).toContain("Gia hạn");
    expect(html).toContain("Không chuyển khoản khi chưa có đơn hợp lệ");
  });

  it("uses the currently published versioned price, including a legitimate price change", () => {
    const [monthly] = premiumPeriodOptions([{ ...published[0], priceVnd: 39000 }]);
    expect(monthly.priceVnd).toBe(39000);
    expect(monthly.priceId).toBe("monthly");
    expect(monthly.available).toBe(true);
    expect(premiumPeriodOptions([])).toHaveLength(2);
    expect(premiumPeriodOptions([]).every(option => !option.available)).toBe(true);
  });

  it("formats expiry and orders in Vietnam time and translates billing states", () => {
    const shown = formatVietnamDateTime(new Date("2026-10-24T17:30:00Z"));
    expect(shown).toContain("25");
    expect(shown).toContain("10");
    expect(shown).toContain("2026");
    expect(billingOrderStatusLabel("PENDING_PAYMENT")).toBe("Chờ thanh toán");
    expect(billingOrderStatusLabel("REVIEW")).toBe("Cần đối soát");
    expect(billingOrderStatusLabel("EXPIRED")).toBe("Đã hết hạn");
    expect(billingOrderStatusLabel("PAID")).toBe("Đã nhận tiền, chờ kích hoạt");
    expect(billingOrderStatusLabel("PAID", new Date())).toBe("Premium đã kích hoạt");
  });

  it("never treats checkout creation or suspended checkout as confirmed payment", () => {
    const pending = billingOrderStatusDescription("PENDING_PAYMENT", null, true);
    expect(pending).toContain("chưa ghi nhận giao dịch thanh toán được xác minh");
    expect(pending).not.toContain("đã được kích hoạt");
    expect(billingOrderStatusDescription("PENDING_PAYMENT", null, false)).toContain("không chuyển khoản");
    expect(billingOrderStatusDescription("REVIEW", null, true)).toContain("Không chuyển tiền lần nữa");
    expect(billingOrderStatusDescription("EXPIRED", null, false)).toContain("hết hạn");
    expect(billingOrderStatusDescription("REFUNDED", null, false)).toContain("hoàn tiền");
  });

  it("keeps verified and activated history clear even if new checkout is disabled", () => {
    expect(billingOrderStatusDescription("PAID", new Date("2026-10-24T12:00:00Z"), false))
      .toContain("Premium đã được kích hoạt");
    expect(billingOrderStatusDescription("PAID", null, false)).toContain("đang xử lý kích hoạt");
    expect(billingOrderStatusDescription("UNKNOWN", null, false)).toContain("đối soát ngoại lệ");
  });
});
