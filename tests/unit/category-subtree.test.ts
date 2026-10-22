import { describe, expect, it } from "vitest";
import { categorySubtreeIds } from "@/lib/category-subtree";

describe("category transaction subtree drill-through", () => {
  it("includes descendants at any depth and archived category nodes", () => {
    expect(categorySubtreeIds([
      { id: "root", parentId: null }, { id: "a", parentId: "root" },
      { id: "b", parentId: "a" }, { id: "other", parentId: null },
    ], "root").sort()).toEqual(["a", "b", "root"]);
  });
  it("terminates on legacy cycles and includes the parent itself", () => {
    expect(categorySubtreeIds([{ id: "a", parentId: "b" }, { id: "b", parentId: "a" }], "a").sort()).toEqual(["a", "b"]);
    expect(categorySubtreeIds([], "solo")).toEqual(["solo"]);
  });
});
