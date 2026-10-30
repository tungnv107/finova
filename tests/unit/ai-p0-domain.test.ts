import { describe, expect, it } from "vitest";
import { classifyFromHistory, redactDescription } from "@/lib/ai-classification";
import { financialIntelligence, type FinancialDay } from "@/lib/financial-intelligence";
const categories = [{ id: "food", name: "Ăn uống", kind: "EXPENSE" }, { id: "travel", name: "Đi lại", kind: "EXPENSE" }, { id: "salary", name: "Lương", kind: "INCOME" }];
describe("P0 personal classification", () => {
  it("prefers the user's historical corrections to keywords", () => {
    expect(classifyFromHistory("Grab 123456789", "EXPENSE", categories, [{ kind: "EXPENSE", note: "Grab 987654321", categoryId: "food" }])).toMatchObject({ categoryId: "food", source: "HISTORY" });
  });
  it("does not select a foreign, archived or wrong-kind category", () => {
    const history = [{ kind: "EXPENSE", note: "Cafe", categoryId: "foreign" }];
    expect(classifyFromHistory("Cafe", "EXPENSE", categories, history)).toMatchObject({ categoryId: "food", source: "RULE" });
    expect(classifyFromHistory("salary", "EXPENSE", categories, [])).toHaveProperty("categoryId", null);
  });
  it("does not force an inconsistent historical category", () => {
    expect(classifyFromHistory("Grab", "EXPENSE", categories, [{ kind: "EXPENSE", note: "Grab", categoryId: "food" }, { kind: "EXPENSE", note: "Grab", categoryId: "travel" }]).categoryId).toBeNull();
  });
  it("uses Vietnamese words and avoids substring false matches", () => {
    expect(classifyFromHistory("Tiền xăng", "EXPENSE", categories, []).categoryId).toBe("travel");
    expect(classifyFromHistory("company", "EXPENSE", categories, []).categoryId).toBeNull();
  });
  it("redacts long identifiers and email before cloud prompts", () => {
    const result = redactDescription("TK 1234 5678 9999, user@example.com thanh toan");
    expect(result).not.toContain("1234"); expect(result).not.toContain("user@example.com"); expect(result).toContain("thanh toan");
  });
});
const row = (day: string, amount: string, kind: "EXPENSE" | "INCOME" = "EXPENSE", categoryId = "food"): FinancialDay => ({ day, amount, kind, categoryId, name: categoryId });
describe("P0 finance calculations", () => {
  const now = new Date("2026-10-15T05:00:00Z");
  it("compares equal calendar days, includes refunds, excludes future rows", () => {
    const r = financialIntelligence([row("2026-09-10", "100"), row("2026-09-20", "10000"), row("2026-10-02", "200"), row("2026-10-03", "-50"), row("2026-10-30", "9999")], categories, now);
    expect(r.totals.expense).toBe("150"); expect(r.comparison).toMatchObject({ previousExpense: "100", delta: "50", percent: "50.0" });
    expect(r.drivers[0].delta).toBe("50"); expect(r.totals.projectedExpense).toBe("310");
  });
  it("uses decimal precision beyond JS safe integers", () => {
    const r = financialIntelligence([row("2026-10-02", "9999999999999999"), row("2026-10-03", "1")], categories, now);
    expect(r.totals.expense).toBe("10000000000000000");
  });
  it("caps suggested expenses at 80% of historical income", () => {
    const r = financialIntelligence([row("2026-09-02", "1000", "INCOME", "salary"), row("2026-09-03", "1000")], categories.filter(c => c.kind === "EXPENSE"), now);
    expect(r.suggestions[0].limitAmount).toBe("800"); expect(r.historyMonths).toBe(1);
  });
  it("does not divide by zero or fabricate budgets on empty data", () => {
    const r = financialIntelligence([], categories, now);
    expect(r.suggestions).toEqual([]); expect(r.comparison.percent).toBeNull(); expect(r.hasData).toBe(false);
  });
  it("still proposes a budget for a newly used category", () => {
    const r = financialIntelligence([row("2026-09-02", "1000", "INCOME", "salary"), row("2026-10-03", "100")], categories, now);
    expect(r.suggestions[0]).toMatchObject({ categoryId: "food", confidence: "LOW" });
    expect(r.suggestions[0].reason).toContain("chưa có lịch sử");
  });
  it("handles leap February and Vietnamese midnight", () => {
    const r = financialIntelligence([], categories, new Date("2024-02-28T17:01:00Z"));
    expect(r.period).toMatchObject({ today: "2024-02-29", daysInMonth: 29, elapsedDays: 29 });
  });
  it("includes zero-activity months in a historical average", () => {
    const r = financialIntelligence([row("2026-07-03", "3000")], categories, now);
    expect(r.historyMonths).toBe(3); expect(r.suggestions[0].limitAmount).toBe("1050");
  });
  it("flags projections as uncertain in the first week", () => {
    const r = financialIntelligence([row("2026-09-03", "1000"), row("2026-10-01", "500")], categories, new Date("2026-10-02T00:00:00Z"));
    expect(r.suggestions[0].risk).toBe("INSUFFICIENT");
  });
});
