import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillingOrderProgress } from "../../src/components/billing-order-progress";

const createdAt = new Date("2026-10-24T10:00:00Z");
const expiresAt = new Date("2026-10-25T10:00:00Z");
const paidAt = new Date("2026-10-24T10:10:00Z");
const activatedAt = new Date("2026-10-24T10:11:00Z");

function markup(status: string, payment: Date | null = null, activation: Date | null = null, checkoutOpen = true) {
  return renderToStaticMarkup(createElement(BillingOrderProgress, {
    status, createdAt, expiresAt, paidAt: payment, activatedAt: activation, checkoutOpen,
  }));
}

describe("verified Premium order progress", () => {
  it("does not claim that creating or copying an order proves payment", () => {
    const html = markup("PENDING_PAYMENT");
    expect(html).toContain("Chờ thanh toán");
    expect(html).toContain("Chờ xác minh tiền vào");
    expect(html).toContain("Chờ kích hoạt Premium");
    expect(html).toContain("không xác nhận đã trả tiền");
    expect((html.match(/class="is-done"/g) ?? [])).toHaveLength(1);
  });

  it("shows verified payment separately from successful activation", () => {
    const paid = markup("PAID", paidAt);
    expect(paid).toContain("Đã nhận tiền, chờ kích hoạt");
    expect(paid).toContain("Đã xác minh tiền vào");
    expect(paid).toContain("Chờ kích hoạt Premium");
    expect((paid.match(/class="is-done"/g) ?? [])).toHaveLength(2);
    const active = markup("PAID", paidAt, activatedAt);
    expect(active).toContain("Premium đã kích hoạt");
    expect((active.match(/class="is-done"/g) ?? [])).toHaveLength(3);
  });

  it("keeps expired and review states explicit without granting access", () => {
    for (const status of ["EXPIRED", "REVIEW", "REFUNDED", "UNKNOWN"]) {
      const html = markup(status, null, null, false);
      expect(html).toContain('role="status"');
      expect(html).not.toContain("Premium đã kích hoạt");
      expect(html).toContain('class="billing-progress-exception"');
    }
  });

  it("does not present a refunded order as currently active even when it once activated Premium", () => {
    const html = markup("REFUNDED", paidAt, activatedAt);
    expect(html).toContain("Đã hoàn tiền");
    expect(html).toContain("Đã xác minh tiền vào trước hoàn tiền");
    expect(html).toContain("Từng kích hoạt Premium");
    expect(html).not.toContain("<strong>Đã kích hoạt Premium</strong>");
    expect(html).toContain("gói đang có hiệu lực");
    expect((html.match(/class="is-done"/g) ?? [])).toHaveLength(1);
    expect((html.match(/class="is-history"/g) ?? [])).toHaveLength(2);
  });

  it("shows terminal states as exceptions instead of endless payment or activation waiting", () => {
    expect(markup("EXPIRED")).toContain("Đơn hết hạn, chưa xác minh tiền vào");
    expect(markup("REVIEW")).toContain("Cần đối soát tiền vào");
    expect(markup("UNKNOWN")).toContain("Chưa xác nhận kích hoạt Premium");
  });

  it("retains confirmed history when a checkout is later closed", () => {
    expect(markup("PAID", paidAt, activatedAt, false)).toContain("Premium đã kích hoạt");
    expect(markup("PENDING_PAYMENT", null, null, false)).toContain("Chờ xác minh tiền vào");
  });
});
