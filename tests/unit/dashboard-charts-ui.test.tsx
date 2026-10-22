import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CashflowBars, CategoryDonut, WalletBalanceBars } from "@/components/dashboard-charts";

describe("dashboard chart accessibility and asset boundaries", () => {
  it("exposes keyboard-accessible parent drill-down and direct leaf links", () => {
    const html = renderToStaticMarkup(<CategoryDonut categories={[
      { id: "meal", name: "Bữa trưa", color: "#123456", amount: "100000" },
      { id: "rent", name: "Tiền nhà", color: "#654321", amount: "200000" },
    ]} tree={[
      { id: "food", parentId: null, name: "Ăn uống", color: "#123456", kind: "EXPENSE" },
      { id: "meal", parentId: "food", name: "Bữa trưa", color: "#123456", kind: "EXPENSE" },
      { id: "rent", parentId: null, name: "Tiền nhà", color: "#654321", kind: "EXPENSE" },
    ]} transactionUrl={(id, scope) => `/transactions?categoryId=${id}&categoryScope=${scope}`} />);
    expect(html).toContain("Xem danh mục con của Ăn uống");
    expect(html).toContain('href="/transactions?categoryId=rent&amp;categoryScope=direct"');
    expect(html).toContain("300.000 ₫");
  });

  it("offers an exact, keyboard-readable category table including net refunds", () => {
    const html = renderToStaticMarkup(<CategoryDonut categories={[
      { id: "food", name: "Ăn uống", color: "#123456", amount: "300000" },
      { id: "ledger:interest", name: "Lãi vay", color: "#789123", amount: "-100000" },
    ]} tree={[{ id: "food", parentId: null, name: "Ăn uống", color: "#123456", kind: "EXPENSE" }]}
    transactionUrl={id => `/transactions?categoryId=${id}`} />);
    expect(html).toContain("Bảng số liệu chi tiêu ròng theo danh mục");
    expect(html).toContain("300.000 ₫");
    expect(html).toContain("−100.000 ₫");
    expect(html).not.toContain("categoryId=ledger%3Ainterest");
  });
  it("offers daily, weekly and monthly grouping with exact VND data in a table", () => {
    const html = renderToStaticMarkup(<CashflowBars series={[
      { date: "2026-10-20", income: "1500000", expense: "250000", surplus: "1250000" },
    ]} transactionUrl="/transactions?start=2026-10-01" />);
    expect(html).toContain('id="cashflow-grouping"');
    expect(html).toContain("Theo tuần (thứ Hai)");
    expect(html).toContain("Theo tháng");
    expect(html).toContain("Bảng dữ liệu thu – chi theo ngày");
    expect(html).toContain("1.500.000 ₫");
    expect(html).toContain("250.000 ₫");
  });

  it("shows exact cutoff balances and wallet-specific links, excludes credit liabilities", () => {
    const html = renderToStaticMarkup(<WalletBalanceBars wallets={[
      { id: "cash-a", name: "Tiền mặt", type: "CASH", balance: "1250000", archived: false, includeInAvailable: true },
      { id: "saving-a", name: "Tiết kiệm", type: "SAVINGS", balance: "5000000", archived: true, includeInAvailable: false },
      { id: "card-a", name: "Thẻ tín dụng", type: "CREDIT", balance: "8000000", archived: false, includeInAvailable: false },
    ]} transactionUrl="/transactions?start=2026-10-01&endExclusive=2026-11-01" />);
    expect(html).toContain("1.250.000 ₫");
    expect(html).toContain("5.000.000 ₫");
    expect(html).not.toContain("8.000.000 ₫");
    expect(html).toContain("cash-a");
    expect(html).toContain("saving-a");
    expect(html).not.toContain("card-a");
    expect(html).toContain("lưu trữ");
  });
});
