import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DebtsManager } from "@/components/debts-manager";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const debt = {
  id: "debt-a", direction: "BORROW" as const, counterparty: "Người cho vay", walletId: "wallet-a", walletName: "Tiền mặt",
  principal: "10000000", remaining: "8000000", annualRate: "12", installmentCount: 10,
  startDate: "2026-01-01", dueDate: "2026-11-01", daysUntilDue: 11, overdue: false, settled: false,
  principalInstallmentEstimate: "800000", monthlyInterestEstimate: "80000", note: null,
  projectedSchedule: [{ installment: 1, dueDate: "2026-02-01", principal: "1000000", interest: "100000", total: "1100000", remaining: "9000000" }],
  payments: [{ id: "payment-a", date: "2026-10-01", principal: "2000000", interest: "100000", walletName: "Tiền mặt" }],
};

function render(overrides: Partial<typeof debt> = {}) {
  return renderToStaticMarkup(<DebtsManager debts={[{ ...debt, ...overrides }]} wallets={[{ id: "wallet-a", name: "Tiền mặt", balance: "5000000" }]} today="2026-10-21" />);
}

describe("debt due dates and history", () => {
  it("shows principal, interest, an upcoming contractual due date, payment history and estimated schedule", () => {
    const html = render();
    expect(html).toContain("8.000.000 ₫");
    expect(html).toContain("Lãi suất năm");
    expect(html).toContain("Sắp đến hạn: còn 11 ngày");
    expect(html).toContain("Lịch sử thanh toán (1)");
    expect(html).toContain("Kế hoạch trả gốc cố định");
    expect(html).toContain("Đến hạn dự kiến");
    expect(html).toContain("Trả gốc / lãi");
  });

  it("warns on overdue, and stops offering payments on settled debts", () => {
    expect(render({ overdue: true, daysUntilDue: -2 })).toContain("đã quá ngày đến hạn");
    const settled = render({ settled: true, remaining: "0", overdue: false });
    expect(settled).toContain("Đã tất toán");
    expect(settled).not.toContain("Trả gốc / lãi</button>");
  });
});
