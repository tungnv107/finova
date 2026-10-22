import { Decimal } from "decimal.js";

export type ExpenseSlice = { id: string; name: string; color: string; amount: string };
export type CategoryBranch = { id: string; parentId: string | null; name: string; color: string; kind: string };
export type DonutRow = ExpenseSlice & { canDrill: boolean; categoryId: string | null; group: "CATEGORY" | "DIRECT" | "LEDGER" | "OTHER" };

export function categoryDonutView(expenses: ExpenseSlice[], branches: CategoryBranch[], selectedParent: string | null, topN = 5) {
  const tree = new Map(branches.filter(c => c.kind === "EXPENSE").map(c => [c.id, c]));
  const children = new Map<string, string[]>();
  for (const c of tree.values()) {
    if (!c.parentId || !tree.has(c.parentId) || c.parentId === c.id) continue;
    children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  }
  const amounts = new Map(expenses.map(c => [c.id, new Decimal(c.amount)]));
  const subtree = (id: string, path = new Set<string>()): Decimal => {
    if (path.has(id)) return new Decimal(0);
    const next = new Set(path); next.add(id);
    return (children.get(id) ?? []).reduce((sum, child) => sum.plus(subtree(child, next)), amounts.get(id) ?? new Decimal(0));
  };
  const rowFor = (id: string): DonutRow => {
    const category = tree.get(id)!;
    return { id, name: category.name, color: category.color, amount: subtree(id).toFixed(0),
      categoryId: id, canDrill: (children.get(id)?.length ?? 0) > 0, group: "CATEGORY" };
  };
  const selected = selectedParent ? tree.get(selectedParent) : undefined;
  const parentId = selected ? selected.id : null;
  let rows: DonutRow[];
  if (selected) {
    rows = (children.get(selected.id) ?? []).map(rowFor);
    const direct = amounts.get(selected.id) ?? new Decimal(0);
    if (!direct.isZero()) rows.push({ id: `direct:${selected.id}`, name: "Giao dịch trực tiếp", color: selected.color,
      amount: direct.toFixed(0), categoryId: selected.id, canDrill: false, group: "DIRECT" });
  } else {
    const roots = [...tree.values()].filter(c => !c.parentId || !tree.has(c.parentId) || c.parentId === c.id);
    rows = roots.map(c => rowFor(c.id));
    rows.push(...expenses.filter(c => !tree.has(c.id)).map(c => ({ ...c, categoryId: null, canDrill: false, group: "LEDGER" as const })));
    // Should not happen with the DB cycle guard, but keep malformed legacy data visible.
    const covered = new Set<string>();
    const visit = (id: string) => { if (covered.has(id)) return; covered.add(id); for (const child of children.get(id) ?? []) visit(child); };
    roots.forEach(c => visit(c.id));
    rows.push(...[...tree.values()].filter(c => !covered.has(c.id)).map(c => rowFor(c.id)));
  }
  rows = rows.filter(row => !new Decimal(row.amount).isZero())
    .sort((a, b) => new Decimal(b.amount).comparedTo(a.amount) || a.name.localeCompare(b.name, "vi"));
  const total = rows.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  const pieEligible = total.gt(0) && rows.every(row => new Decimal(row.amount).gt(0));
  const visible = pieEligible && rows.length > topN ? [
    ...rows.slice(0, topN),
    { id: "other", name: "Khác", color: "#94A3B8", amount: rows.slice(topN).reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toFixed(0),
      categoryId: null, canDrill: false, group: "OTHER" as const },
  ] : rows;
  return { rows, visible, total: total.toFixed(0), pieEligible, selected: selected ?? null, parentId, upId: selected?.parentId ?? null };
}
