export type CategoryLink = { id: string; parentId: string | null };

/** Includes the selected category, all its descendants, and archived nodes. */
export function categorySubtreeIds(categories: CategoryLink[], categoryId: string): string[] {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    children.set(category.parentId, [...(children.get(category.parentId) ?? []), category.id]);
  }
  const visited = new Set<string>();
  const pending = [categoryId];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return [...visited];
}
