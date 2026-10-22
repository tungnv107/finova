import { describe, expect, it } from "vitest";
import { categoryDonutView } from "@/lib/category-donut";

const branches = [
  { id: "food", parentId: null, name: "Ăn uống", kind: "EXPENSE", color: "#123456" },
  { id: "lunch", parentId: "food", name: "Bữa trưa", kind: "EXPENSE", color: "#123457" },
  { id: "dinner", parentId: "food", name: "Bữa tối", kind: "EXPENSE", color: "#123458" },
  { id: "salary", parentId: null, name: "Lương", kind: "INCOME", color: "#123459" },
];

describe("hierarchical net expense donut", () => {
  it("rolls child amounts up without counting a posting twice", () => {
    const expenses = [
      { id: "food", name: "Ăn uống", color: "#123456", amount: "100" },
      { id: "lunch", name: "Bữa trưa", color: "#123457", amount: "250" },
      { id: "dinner", name: "Bữa tối", color: "#123458", amount: "-50" },
      { id: "ledger:interest", name: "Lãi vay", color: "#aaaaaa", amount: "25" },
    ];
    const root = categoryDonutView(expenses, branches, null);
    expect(root.total).toBe("325");
    expect(root.rows.map(r => [r.id, r.amount])).toEqual([["food", "300"], ["ledger:interest", "25"]]);
    const food = categoryDonutView(expenses, branches, "food");
    expect(food.total).toBe("300");
    expect(food.rows.map(r => [r.id, r.amount])).toEqual([["lunch", "250"], ["direct:food", "100"], ["dinner", "-50"]]);
    expect(food.pieEligible).toBe(false);
    expect(food.rows[1].categoryId).toBe("food");
  });
  it("groups all amounts beyond top N into an exact Khác slice", () => {
    const meta = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `Nhóm ${i}`, parentId: null, kind: "EXPENSE", color: "#abcdef" }));
    const amounts = meta.map((c, i) => ({ id: c.id, name: c.name, color: c.color, amount: String((i + 1) * 1000000000000) }));
    const view = categoryDonutView(amounts, meta, null);
    expect(view.total).toBe("36000000000000");
    expect(view.visible).toHaveLength(6);
    expect(view.visible.at(-1)).toMatchObject({ id: "other", name: "Khác", amount: "6000000000000" });
    expect(view.visible.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(36000000000000);
  });
  it("keeps empty, refund and archived category paths visible without fabricated values", () => {
    expect(categoryDonutView([], branches, null).rows).toEqual([]);
    const negative = categoryDonutView([{ id: "lunch", name: "Bữa trưa", color: "#000000", amount: "-200" }], branches, null);
    expect(negative.total).toBe("-200");
    expect(negative.pieEligible).toBe(false);
    expect(negative.rows[0].name).toBe("Ăn uống");
  });
});
