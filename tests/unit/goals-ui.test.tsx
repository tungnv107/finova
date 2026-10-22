import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GoalsManager } from "@/components/goals-manager";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const goal = {
  id: "goal-a", name: "Quỹ khẩn cấp", walletId: "wallet-a", walletName: "Tiền mặt",
  target: "10000000", allocated: "4000000", remaining: "6000000", progress: "40",
  dueDate: "2027-04-01", daysLeft: 160, archived: false, monthlyNeeded: "1125000",
  walletUnderfunded: false,
  events: [{ id: "event-a", kind: "ALLOCATE" as const, amount: "4000000", note: null, createdAt: "2026-10-20T05:00:00Z" }],
};

describe("goal progress and projections", () => {
  it("renders real allocated/remaining amounts, an accessible progress bar and explicitly estimated monthly savings", () => {
    const html = renderToStaticMarkup(<GoalsManager goals={[goal]} wallets={[{ id: "wallet-a", name: "Tiền mặt", balance: "5000000" }]} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain("4.000.000 ₫");
    expect(html).toContain("6.000.000 ₫");
    expect(html).toContain("Ước tính cần 1.125.000 ₫ mỗi 30 ngày");
    expect(html).toContain("Lịch sử phân bổ (1 gần nhất)");
    expect(html).toContain("Dành tiền");
    expect(html).toContain("Rút phân bổ");
    expect(html).toContain("Lưu trữ");
  });

  it("does not offer allocations to archived goals and allows restoration", () => {
    const html = renderToStaticMarkup(<GoalsManager goals={[{ ...goal, archived: true, monthlyNeeded: null }]} wallets={[{ id: "wallet-a", name: "Tiền mặt", balance: "5000000" }]} />);
    expect(html).toContain("Đã lưu trữ");
    expect(html).toContain("Khôi phục");
    expect(html).not.toContain("Rút phân bổ</button>");
  });
});
