import { requirePageContext } from "@/server/page-context";
import { listCategories } from "@/server/categories";
import { CategoryManager } from "@/components/category-manager";

export default async function CategoriesPage() {
  const ctx = await requirePageContext();
  const categories = await listCategories(ctx.workspaceId, true);
  return <CategoryManager categories={categories.map(category => ({
    id: category.id, parentId: category.parentId, name: category.name, kind: category.kind as "INCOME" | "EXPENSE", icon: category.icon, color: category.color, archived: category.archivedAt !== null,
  }))} />;
}
