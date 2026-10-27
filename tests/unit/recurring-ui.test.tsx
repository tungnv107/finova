import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecurringManager } from "@/components/recurring-manager";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Inspect contextual actions passed to the overflow menu; the actual menu stays closed until interaction.
vi.mock("@/components/ui/interaction-controls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/interaction-controls")>();
  return { ...actual, ActionMenu: ({ label, items }: { label: string; items: { label: string }[] }) =>
    <span aria-label={label}>{items.map(item => item.label).join(", ")}</span> };
});

const rule = {
  id: "rule-a", name: "Tiền nhà", frequency: "MONTHLY", interval: 1, mode: "CONFIRM", kind: "EXPENSE",
  amount: "3000000", startDate: "2026-01-01", endDate: "2027-12-31", paused: false,
};

function render(periodKey: string, status = "PENDING", transactionId: string | null = null) {
  return renderToStaticMarkup(<RecurringManager data={{ rules: [rule], occurrences: [{
    id: "occurrence-a", periodKey, status, transactionId,
    rule: { name: rule.name, kind: rule.kind, mode: rule.mode, paused: false, amount: rule.amount },
  }] }} wallets={[{ id: "wallet-a", name: "Ví tiền" }]} categories={[]} initialTab={status === "PENDING" ? "pending" : "history"} />);
}

describe("recurring action visibility", () => {
  it("allows skipping an upcoming occurrence but does not post it before its due date", () => {
    const html = render("2099-01-01");
    expect(html).toContain("Bỏ qua");
    expect(html).not.toContain("Ghi nhận");
    expect(html).toContain("Chờ ghi nhận");
  });

  it("allows confirmation and skip for a due occurrence", () => {
    const html = render("2020-01-01");
    expect(html).toContain("Ghi nhận");
    expect(html).toContain("Bỏ qua");
  });

  it("shows posted history without actions and links to workspace-scoped details", () => {
    const html = render("2020-01-01", "POSTED", "tx-a");
    expect(html).toContain("/transactions?transactionId=tx-a");
    expect(html).not.toContain("Ghi nhận");
    expect(html).not.toContain("Bỏ qua");
  });
});
