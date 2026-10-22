import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FinanceDashboard } from "@/components/finance-dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Props = Parameters<typeof FinanceDashboard>[0];

const comparisonChange = { change: null, percent: null };
const baseReport: Props["report"] = {
  period: { start: "2026-10-01", endExclusive: "2026-11-01" },
  filters: { walletId: null, categoryId: null },
  kpis: { income: "0", expense: "0", surplus: "0", available: "1000000", savingsRate: null,
    averageDailyExpense: "0", netWorth: "1000000", budgetUsage: null },
  comparison: {
    mode: "equal_calendar_days", start: "2026-09-01", endExclusive: "2026-10-01",
    averageDayBasis: { current: 22, previous: 30 },
    previous: { income: "0", expense: "0", surplus: "0", available: "1000000", savingsRate: null,
      averageDailyExpense: "0", netWorth: "1000000" },
    changes: { income: comparisonChange, expense: comparisonChange, surplus: comparisonChange,
      available: comparisonChange, savingsRate: comparisonChange, averageDailyExpense: comparisonChange,
      netWorth: comparisonChange, budgetUsage: null },
  },
  wallets: [{ id: "cash", name: "Tiền mặt", type: "CASH", balance: "1000000", archived: false, includeInAvailable: true }],
  series: [],
  categories: [], recentTransactions: [], topExpenses: [],
};
const worth: Props["worth"] = {
  current: { date: "2026-10-22", assets: "1000000", receivables: "0", liabilities: "0", netWorth: "1000000" },
  comparison: { date: "2026-09-22", assets: "1000000", receivables: "0", liabilities: "0", netWorth: "1000000" },
  change: "0",
} as Props["worth"];

function render(report: Props["report"] = baseReport, allWallets: Props["allWallets"] = [{ id: "cash", name: "Tiền mặt" }]) {
  return renderToStaticMarkup(<FinanceDashboard report={report} allWallets={allWallets} allCategories={[]} worth={worth} />);
}

describe("Dashboard empty state with real financial balance", () => {
  it("keeps the wallet's available balance while replacing zero charts with one actionable state", () => {
    const html = render();
    expect(html).toContain("1.000.000 ₫");
    expect(html).toContain("Không có thu chi trong khoảng thời gian đã chọn");
    expect(html).toContain("Đổi khoảng thời gian");
    expect(html).toContain('href="/imports"');
    expect(html).not.toContain("Thu – chi ròng theo ngày");
    expect(html).not.toContain("Giao dịch gần đây");
    expect(html).not.toContain("Các khoản chi lớn");
  });

  it("keeps a transfer-only transaction list without an empty expense card", () => {
    const html = render({ ...baseReport, recentTransactions: [{ id: "transfer-1", kind: "TRANSFER", amount: "50000",
      walletName: "Tiền mặt", occurredAt: "2026-10-15T03:00:00.000Z", note: null }] });
    expect(html).toContain("Không có thu chi trong khoảng thời gian đã chọn");
    expect(html).toContain("Giao dịch gần đây");
    expect(html).toContain("Chuyển ví");
    expect(html).not.toContain("Các khoản chi lớn");
  });

  it("does not mistake offsetting income/expense postings for a period with no activity", () => {
    const html = render({ ...baseReport, series: [{ date: "2026-10-15", income: "0", expense: "0", surplus: "0" }] });
    expect(html).not.toContain("Không có thu chi trong khoảng thời gian đã chọn");
    expect(html).toContain("Thu – chi ròng theo ngày");
  });

  it("guides a first-time user to create a wallet without duplicating the filtered no-activity state", () => {
    const html = render({ ...baseReport, wallets: [], kpis: { ...baseReport.kpis, available: "0" } }, []);
    expect(html).toContain("Tạo ví đầu tiên");
    expect(html).not.toContain("Không có thu chi trong khoảng thời gian đã chọn");
    expect(html).not.toContain("Các khoản chi lớn");
  });
});
