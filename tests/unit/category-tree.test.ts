import { describe, expect, it, vi } from "vitest";
import { validateCategoryParent } from "@/server/categories";
import { categoryTreeRows, possibleCategoryParents } from "@/components/category-manager";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const nodes = [
  { id: "parent", parentId: null, kind: "EXPENSE" as const, archivedAt: null },
  { id: "child", parentId: "parent", kind: "EXPENSE" as const, archivedAt: null },
  { id: "grandchild", parentId: "child", kind: "EXPENSE" as const, archivedAt: null },
  { id: "archived", parentId: null, kind: "EXPENSE" as const, archivedAt: new Date() },
  { id: "income", parentId: null, kind: "INCOME" as const, archivedAt: null },
];

const categories = nodes.map(node => ({ ...node, name: node.id, icon: "Circle", color: "#ffffff", archived: !!node.archivedAt }));

describe("category hierarchy invariants", () => {
  it("allows top-level and same-kind nested categories", () => {
    expect(() => validateCategoryParent(nodes, null, "EXPENSE")).not.toThrow();
    expect(() => validateCategoryParent(nodes, "grandchild", "EXPENSE")).not.toThrow();
  });
  it("rejects foreign, wrong-kind, archived and cyclic parent IDs", () => {
    expect(() => validateCategoryParent(nodes, "foreign", "EXPENSE")).toThrow("Không tìm thấy");
    expect(() => validateCategoryParent(nodes, "income", "EXPENSE")).toThrow("cùng loại");
    expect(() => validateCategoryParent(nodes, "archived", "EXPENSE")).toThrow("lưu trữ");
    expect(() => validateCategoryParent(nodes, "grandchild", "EXPENSE", "parent")).toThrow("vòng lặp");
    expect(() => validateCategoryParent(nodes, "parent", "EXPENSE", "parent")).toThrow("vòng lặp");
  });
  it("renders descendants after their parents with stable depth", () => {
    expect(categoryTreeRows(categories, "EXPENSE").map(row => [row.category.id, row.depth])).toEqual([
      ["archived", 0], ["parent", 0], ["child", 1], ["grandchild", 2],
    ]);
  });
  it("excludes archived nodes, other kinds and descendants from the parent selector", () => {
    expect(possibleCategoryParents(categories, "EXPENSE", "parent").map(c => c.id)).toEqual([]);
    expect(possibleCategoryParents(categories, "EXPENSE", "grandchild").map(c => c.id)).toEqual(["parent", "child"]);
  });
});
