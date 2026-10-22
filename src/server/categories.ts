import { AccountKind, Prisma } from "@finova/prisma";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, type UserContext } from "@/server/context";

const categoryName = z.string().trim().min(1, "Vui lòng nhập tên danh mục.").max(80);
const categoryIcon = z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,39}$/, "Tên biểu tượng không hợp lệ.");
const categoryColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Màu phải là mã HEX gồm 6 chữ số.");

export const newCategorySchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]),
  name: categoryName,
  icon: categoryIcon.default("Circle"),
  color: categoryColor.default("#1E5EFF"),
  parentId: z.string().min(1).nullable().optional(),
}).strict();

export const editCategorySchema = z.object({
  name: categoryName.optional(),
  icon: categoryIcon.optional(),
  color: categoryColor.optional(),
  archived: z.boolean().optional(),
  parentId: z.string().min(1).nullable().optional(),
}).strict().refine(value => Object.values(value).some(v => v !== undefined), { message: "Cần ít nhất một trường cần sửa." });

type CategoryNode = { id: string; parentId: string | null; kind: AccountKind; archivedAt: Date | null };

export function validateCategoryParent(nodes: CategoryNode[], parentId: string | null, kind: AccountKind, selfId?: string) {
  if (parentId === null) return;
  const lookup = new Map(nodes.map(node => [node.id, node]));
  const visited = new Set<string>();
  let id: string | null = parentId;
  while (id) {
    if (visited.has(id) || id === selfId) throw new HttpError(422, "CATEGORY_CYCLE", "Danh mục cha tạo thành vòng lặp.");
    visited.add(id);
    const node = lookup.get(id);
    if (!node) throw new HttpError(404, "CATEGORY_PARENT_NOT_FOUND", "Không tìm thấy danh mục cha.");
    if (node.kind !== kind) throw new HttpError(422, "CATEGORY_KIND", "Danh mục cha phải cùng loại thu hoặc chi.");
    if (node.archivedAt) throw new HttpError(422, "CATEGORY_ARCHIVED_PARENT", "Không thể chọn danh mục cha đã lưu trữ.");
    id = node.parentId;
  }
}

function hasActiveDescendant(nodes: CategoryNode[], id: string) {
  const queue = [id];
  const visited = new Set(queue);
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of nodes) {
      if (child.parentId !== current || visited.has(child.id)) continue;
      if (!child.archivedAt) return true;
      visited.add(child.id);
      queue.push(child.id);
    }
  }
  return false;
}

export async function listCategories(workspaceId: string, includeArchived = false) {
  return prisma.category.findMany({
    where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }), kind: { in: [AccountKind.INCOME, AccountKind.EXPENSE] } },
    select: { id: true, parentId: true, name: true, kind: true, icon: true, color: true, archivedAt: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

export async function createCategory(context: UserContext, raw: unknown) {
  const input = newCategorySchema.parse(raw);
  return prisma.$transaction(async tx => {
    const nodes = await tx.category.findMany({ where: { workspaceId: context.workspaceId }, select: { id: true, parentId: true, kind: true, archivedAt: true } });
    validateCategoryParent(nodes, input.parentId ?? null, input.kind);
    const account = await tx.ledgerAccount.create({ data: {
      workspaceId: context.workspaceId, code: `CAT_CUSTOM_${crypto.randomUUID()}`,
      name: input.name, kind: input.kind,
    } });
    const category = await tx.category.create({ data: {
      workspaceId: context.workspaceId, ledgerAccountId: account.id, ...input,
    } });
    await tx.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "CREATE", entityType: "CATEGORY", entityId: category.id } });
    return category;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateCategory(context: UserContext, id: string, raw: unknown) {
  const input = editCategorySchema.parse(raw);
  return prisma.$transaction(async tx => {
    const category = await tx.category.findFirst({ where: { workspaceId: context.workspaceId, id } });
    if (!category) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy danh mục.");
    const nodes = await tx.category.findMany({ where: { workspaceId: context.workspaceId }, select: { id: true, parentId: true, kind: true, archivedAt: true } });
    if (input.parentId !== undefined) validateCategoryParent(nodes, input.parentId, category.kind, id);
    if (input.archived === true && hasActiveDescendant(nodes, id)) {
      throw new HttpError(422, "CATEGORY_ACTIVE_CHILDREN", "Hãy lưu trữ hoặc chuyển các danh mục con trước.");
    }
    if (input.archived === false && category.parentId) {
      validateCategoryParent(nodes, category.parentId, category.kind, id);
    }
    const data: Prisma.CategoryUncheckedUpdateInput = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.icon === undefined ? {} : { icon: input.icon }),
      ...(input.color === undefined ? {} : { color: input.color }),
      ...(input.archived === undefined ? {} : { archivedAt: input.archived ? new Date() : null }),
      // Setting only parentId preserves required workspaceId (Prisma disconnect nulls both composite FK fields).
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    };
    const updated = await tx.category.update({ where: { id: category.id, workspaceId: context.workspaceId }, data });
    if (input.name !== undefined && input.name !== category.name) {
      await tx.ledgerAccount.update({ where: { id: category.ledgerAccountId, workspaceId: context.workspaceId }, data: { name: input.name } });
    }
    await tx.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "UPDATE", entityType: "CATEGORY", entityId: category.id } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
