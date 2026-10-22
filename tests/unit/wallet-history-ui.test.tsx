import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletManager } from "@/components/wallet-manager";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

describe("wallet history UX", () => {
  it("offers owned wallet selection, an as-of date and loading/error controls", () => {
    const html = renderToStaticMarkup(<WalletManager wallets={[
      { id: "wallet-a", name: "Tiền mặt", balance: "1250", currency: "VND", type: "CASH", archived: false, includeInAvailable: true },
    ]} />);
    expect(html).toContain("Lịch sử số dư ví");
    expect(html).toContain('id="wallet-history-wallet"');
    expect(html).toContain('id="wallet-history-date"');
    expect(html).toContain("Xem số dư và lịch sử");
    expect(html).toContain("1.250 ₫");
    expect(html).not.toContain("Đang tải dữ liệu sổ cái");
  });
  it("keeps the initial onboarding focused on creating a wallet", () => {
    const html = renderToStaticMarkup(<WalletManager wallets={[]} onboarding />);
    expect(html).toContain("Thiết lập ví đầu tiên");
    expect(html).not.toContain("Lịch sử số dư ví");
  });
});
