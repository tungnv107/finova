import { BudgetThreshold, Prisma } from "@finova/prisma";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { localDay, vndDayStart } from "@/lib/dates";
import { Decimal, money, parseVnd } from "@/lib/money";
import { HttpError, type UserContext } from "@/server/context";
import { serializable } from "@/server/serializable";

const positiveAmount = z.string().regex(/^[1-9]\d{0,15}$/, "Hạn mức VND phải là số nguyên dương.");
const budgetFields = z.object({
  name: z.string().trim().min(1).max(100),
  scope: z.enum(["TOTAL", "CATEGORY", "GROUP"]),
  period: z.enum(["WEEKLY", "MONTHLY", "CUSTOM"]),
  start: z.iso.date(),
  endExclusive: z.iso.date(),
  limitAmount: positiveAmount,
  categoryIds: z.array(z.string().min(1)).max(30),
}).strict();
export const newBudgetSchema = budgetFields;
export const editBudgetSchema = budgetFields.partial().extend({ archived: z.boolean().optional() }).strict()
  .refine(value => Object.values(value).some(v => v !== undefined), "Không có trường cần sửa.");

type BudgetFields = z.infer<typeof budgetFields>;

function validateBudget(input: BudgetFields) {
  const startAt = vndDayStart(input.start);
  const endAt = vndDayStart(input.endExclusive);
  const duration = (endAt.getTime() - startAt.getTime()) / 86400_000;
  if (duration <= 0 || duration > 366) throw new HttpError(400, "INVALID_PERIOD", "Kỳ ngân sách phải từ 1 đến 366 ngày.");
  if (input.period === "WEEKLY" && (duration !== 7 || new Date(`${input.start}T12:00:00Z`).getUTCDay() !== 1)) {
    throw new HttpError(400, "INVALID_PERIOD", "Ngân sách tuần bắt đầu thứ Hai và kéo dài 7 ngày.");
  }
  if (input.period === "MONTHLY") {
    const y = Number(input.start.slice(0, 4));
    const m = Number(input.start.slice(5, 7));
    const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    if (!input.start.endsWith("-01") || input.endExclusive !== next) {
      throw new HttpError(400, "INVALID_PERIOD", "Ngân sách tháng phải bắt đầu ngày 01 và kết thúc đầu tháng kế tiếp.");
    }
  }
  parseVnd(input.limitAmount);
  const unique = new Set(input.categoryIds);
  if (unique.size !== input.categoryIds.length ||
    (input.scope === "TOTAL" && unique.size !== 0) ||
    (input.scope === "CATEGORY" && unique.size !== 1) ||
    (input.scope === "GROUP" && unique.size < 2)) {
    throw new HttpError(400, "INVALID_SCOPE", "Ngân sách tổng không chọn danh mục; danh mục chọn một; nhóm chọn từ hai danh mục khác nhau.");
  }
  return { startAt, endAt };
}

const withCategories = { categories: { include: { category: { select: { id: true, name: true, color: true, kind: true } } } } } as const;

async function validateWorkspaceCategories(tx: Prisma.TransactionClient, workspaceId: string, input: BudgetFields) {
  if (!input.categoryIds.length) return;
  const count = await tx.category.count({ where: {
    workspaceId, id: { in: input.categoryIds }, kind: "EXPENSE", archivedAt: null,
  } });
  if (count !== input.categoryIds.length) throw new HttpError(400, "INVALID_CATEGORY", "Danh mục chi không tồn tại, đã lưu trữ hoặc thuộc workspace khác.");
}

async function assertNoOverlap(tx: Prisma.TransactionClient, workspaceId: string, input: BudgetFields, id?: string) {
  // Serialize concurrent writes inside one workspace to prevent overlapping budget scopes.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
  const { startAt, endAt } = validateBudget(input);
  const others = await tx.budget.findMany({ where: {
    workspaceId, archivedAt: null, id: id ? { not: id } : undefined,
    startAt: { lt: endAt }, endAt: { gt: startAt },
  }, include: { categories: true } });
  for (const other of others) {
    // TOTAL budgets coexist with category budgets, but must never be summed with them.
    if (input.scope === "TOTAL" && other.scope === "TOTAL") {
      throw new HttpError(409, "BUDGET_OVERLAP", "Đã có ngân sách tổng trùng thời gian.");
    }
    if (input.scope !== "TOTAL" && other.scope !== "TOTAL" &&
      other.categories.some(c => input.categoryIds.includes(c.categoryId))) {
      throw new HttpError(409, "BUDGET_OVERLAP", "Một danh mục đã thuộc ngân sách khác trong thời gian này.");
    }
  }
}

function dataForBudget(workspaceId: string, input: BudgetFields) {
  const { startAt, endAt } = validateBudget(input);
  return { workspaceId, name: input.name, scope: input.scope, period: input.period,
    limitAmount: input.limitAmount, startAt, endAt, currency: "VND",
    categories: { create: input.categoryIds.map(categoryId => ({
      category: { connect: { workspaceId_id: { workspaceId, id: categoryId } } },
    })) },
  };
}

export async function createBudget(context: UserContext, raw: unknown) {
  const input = newBudgetSchema.parse(raw);
  validateBudget(input);
  return prisma.$transaction(async tx => {
    await assertNoOverlap(tx, context.workspaceId, input);
    await validateWorkspaceCategories(tx, context.workspaceId, input);
    const budget = await tx.budget.create({ data: dataForBudget(context.workspaceId, input), include: withCategories });
    await tx.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "CREATE", entityType: "BUDGET", entityId: budget.id } });
    return serializeBudget(budget);
  });
}

export async function updateBudget(context: UserContext, id: string, raw: unknown) {
  const patch = editBudgetSchema.parse(raw);
  return prisma.$transaction(async tx => {
    // Shared workspace lock ensures update/archive also serializes with create.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.workspaceId}))`;
    const existing = await tx.budget.findFirst({ where: { workspaceId: context.workspaceId, id }, include: withCategories });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy ngân sách.");
    const input = budgetFields.parse({
      name: patch.name ?? existing.name, scope: patch.scope ?? existing.scope,
      period: patch.period ?? existing.period,
      start: patch.start ?? localDay(existing.startAt),
      endExclusive: patch.endExclusive ?? localDay(existing.endAt),
      limitAmount: patch.limitAmount ?? money(existing.limitAmount.toString()),
      categoryIds: patch.categoryIds ?? existing.categories.map(c => c.categoryId),
    });
    validateBudget(input);
    if (patch.archived !== true) {
      await assertNoOverlap(tx, context.workspaceId, input, id);
      await validateWorkspaceCategories(tx, context.workspaceId, input);
    }
    const data = dataForBudget(context.workspaceId, input);
    const updated = await tx.budget.update({ where: { id, workspaceId: context.workspaceId }, data: {
      name: data.name, scope: data.scope, period: data.period,
      limitAmount: data.limitAmount, startAt: data.startAt, endAt: data.endAt,
      archivedAt: patch.archived === undefined ? existing.archivedAt : (patch.archived ? new Date() : null),
      categories: { deleteMany: {}, create: input.categoryIds.map(categoryId => ({
        category: { connect: { workspaceId_id: { workspaceId: context.workspaceId, id: categoryId } } },
      })) },
    }, include: withCategories });
    await tx.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "UPDATE", entityType: "BUDGET", entityId: id } });
    return serializeBudget(updated);
  });
}

type BudgetWithCategories = Prisma.BudgetGetPayload<{ include: typeof withCategories }>;
function serializeBudget(b: BudgetWithCategories) {
  return { id: b.id, name: b.name, scope: b.scope, period: b.period, start: localDay(b.startAt), endExclusive: localDay(b.endAt),
    limitAmount: money(b.limitAmount.toString()), categoryIds: b.categories.map(c => c.categoryId),
    categories: b.categories.map(c => c.category), archived: !!b.archivedAt };
}

export function thresholdState(used: Decimal.Value, limit: Decimal.Value): BudgetThreshold[] {
  const percent = new Decimal(used).div(limit).mul(100);
  return ([
    ["P50", percent.gte(50)], ["P80", percent.gte(80)],
    ["P100", percent.gte(100)], ["OVER100", percent.gt(100)],
  ] as const).filter(([, reached]) => reached).map(([threshold]) => threshold);
}

type BudgetUsage = { budgetId: string; used: Prisma.Decimal };
const thresholds = ["P50", "P80", "P100", "OVER100"] as const;

export async function listBudgetPerformance(workspaceId: string, includeArchived = false) {
  const now = new Date();
  // Read the budget definition and its ledger totals in one serializable snapshot.
  // The same transaction reconciles alerts, so a concurrent refund cannot leave
  // a permanently stale threshold and simultaneous dashboard reads cannot duplicate it.
  return serializable(async tx => {
    const budgets = await tx.budget.findMany({ where: { workspaceId, ...includeArchived ? {} : { archivedAt: null } },
      include: withCategories, orderBy: [{ startAt: "desc" }, { createdAt: "desc" }], take: 100 });
    if (!budgets.length) return [];

    // One aggregate for all budgets. PostgreSQL sums NUMERIC values exactly,
    // including CREDIT reversals/refunds, instead of transferring every posting
    // to the application and issuing an N+1 query per budget.
    const totals = await tx.$queryRaw<BudgetUsage[]>(Prisma.sql`
      SELECT b."id" AS "budgetId",
             SUM(CASE WHEN p."side" = 'DEBIT'::"EntrySide" THEN p."amount" ELSE -p."amount" END) AS "used"
      FROM "Budget" b
      JOIN "Journal" j ON j."workspaceId" = b."workspaceId"
        AND j."effectiveAt" >= b."startAt" AND j."effectiveAt" < b."endAt"
      JOIN "Posting" p ON p."journalId" = j."id"
      JOIN "LedgerAccount" a ON a."id" = p."ledgerAccountId"
        AND a."workspaceId" = b."workspaceId" AND a."kind" = 'EXPENSE'::"AccountKind"
      WHERE b."workspaceId" = ${workspaceId}
        AND b."id" IN (${Prisma.join(budgets.map(b => b.id))})
        AND (b."scope" = 'TOTAL'::"BudgetScope" OR EXISTS (
          SELECT 1 FROM "BudgetCategory" bc
          JOIN "Category" c ON c."id" = bc."categoryId"
            AND c."workspaceId" = bc."workspaceId"
          WHERE bc."budgetId" = b."id" AND bc."workspaceId" = b."workspaceId"
            AND c."ledgerAccountId" = a."id"
        ))
      GROUP BY b."id"
    `);
    const usedByBudget = new Map(totals.map(row => [row.budgetId, new Decimal(row.used.toString())]));
    const reachedKeys: { budgetId: string; periodKey: string; threshold: BudgetThreshold }[] = [];
    const resolvedKeys: typeof reachedKeys = [];

    const result = budgets.map(b => {
      const used = usedByBudget.get(b.id) ?? new Decimal(0);
      const limit = new Decimal(b.limitAmount.toString());
      const percent = used.div(limit).mul(100).toDecimalPlaces(2);
      const remaining = limit.minus(used);
      const reached = thresholdState(used, limit);
      if (!b.archivedAt) {
        const periodKey = `${localDay(b.startAt)}/${localDay(b.endAt)}`;
        for (const threshold of thresholds) {
          const key = { budgetId: b.id, periodKey, threshold };
          if (reached.includes(threshold)) reachedKeys.push(key);
          else resolvedKeys.push(key);
        }
      }
      const elapsed = Math.max(0, Math.min(now.getTime(), b.endAt.getTime()) - b.startAt.getTime());
      const duration = b.endAt.getTime() - b.startAt.getTime();
      const projected = elapsed > 0 ? used.div(elapsed).mul(duration) : null;
      return { ...serializeBudget(b), used: money(used), remaining: money(remaining), percent: percent.toString(),
        projected: projected === null ? null : money(projected), thresholds: reached,
        // TOTAL and category/group budgets are overlapping views, not additive.
        calculation: "Net EXPENSE ledger postings, including refunds and reversals; transfers excluded" };
    });

    // One upsert-equivalent batch per state, preserving original reachedAt when
    // a refunded amount later crosses the same threshold again.
    if (reachedKeys.length) {
      await tx.budgetAlert.createMany({ data: reachedKeys, skipDuplicates: true });
      await tx.budgetAlert.updateMany({ where: { OR: reachedKeys, resolvedAt: { not: null } }, data: { resolvedAt: null } });
    }
    if (resolvedKeys.length) {
      await tx.budgetAlert.updateMany({ where: { OR: resolvedKeys, resolvedAt: null }, data: { resolvedAt: now } });
    }
    return result;
  });
}
