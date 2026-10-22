import { GoalAllocationKind, Prisma } from "@finova/prisma";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { vndDayStart, localDay } from "@/lib/dates";
import { Decimal, money, normalAmount, parseVnd } from "@/lib/money";
import { HttpError, type UserContext } from "@/server/context";

const amountSchema = z.string().regex(/^[1-9]\d{0,15}$/, "Vui lòng nhập số tiền VND nguyên dương.");
const goalFields = z.object({
  name: z.string().trim().min(1).max(100),
  walletId: z.string().min(1),
  target: amountSchema,
  dueDate: z.iso.date().nullable(),
}).strict();
export const newGoalSchema = goalFields;
export const updateGoalSchema = goalFields.partial().extend({ archived: z.boolean().optional() }).strict()
  .refine(v => Object.values(v).some(x => x !== undefined), "Không có nội dung cập nhật.");
export const goalAllocationSchema = z.object({
  kind: z.enum(["ALLOCATE", "RELEASE"]),
  amount: amountSchema,
  note: z.string().trim().max(300).optional(),
}).strict();

type DB = Prisma.TransactionClient;

async function goalBalance(db: DB, goalId: string) {
  const events = await db.goalAllocation.groupBy({ by: ["kind"], where: { goalId }, _sum: { amount: true } });
  return events.reduce((sum, e) => sum.plus(new Decimal(e._sum.amount?.toString() ?? "0").mul(e.kind === "ALLOCATE" ? 1 : -1)), new Decimal(0));
}

async function requireWallet(db: DB, workspaceId: string, walletId: string) {
  const wallet = await db.wallet.findFirst({ where: { id: walletId, workspaceId, archivedAt: null } });
  if (!wallet) throw new HttpError(400, "INVALID_WALLET", "Ví không tồn tại, đã lưu trữ hoặc ngoài tài khoản của bạn.");
  return wallet;
}

export async function createGoal(context: UserContext, raw: unknown) {
  const input = newGoalSchema.parse(raw);
  parseVnd(input.target);
  const dueAt = input.dueDate ? vndDayStart(input.dueDate) : null;
  return prisma.$transaction(async db => {
    await requireWallet(db, context.workspaceId, input.walletId);
    const goal = await db.savingsGoal.create({ data: {
      workspaceId: context.workspaceId, name: input.name, target: input.target, walletId: input.walletId, dueAt,
    } });
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "CREATE", entityType: "SAVINGS_GOAL", entityId: goal.id } });
    return { id: goal.id };
  });
}

export async function updateGoal(context: UserContext, id: string, raw: unknown) {
  const patch = updateGoalSchema.parse(raw);
  if (patch.target !== undefined) parseVnd(patch.target);
  const dueAt = patch.dueDate === undefined ? undefined : patch.dueDate === null ? null : vndDayStart(patch.dueDate);
  return prisma.$transaction(async db => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.workspaceId}))`;
    const goal = await db.savingsGoal.findFirst({ where: { id, workspaceId: context.workspaceId } });
    if (!goal) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy mục tiêu.");
    const allocated = await goalBalance(db, id);
    if (patch.walletId !== undefined && patch.walletId !== goal.walletId && !allocated.isZero())
      throw new HttpError(409, "GOAL_HAS_FUNDS", "Hãy rút toàn bộ phân bổ trước khi đổi ví.");
    if (patch.archived === true && !allocated.isZero())
      throw new HttpError(409, "GOAL_HAS_FUNDS", "Hãy rút toàn bộ phân bổ trước khi lưu trữ mục tiêu.");
    if (patch.target !== undefined && allocated.gt(patch.target))
      throw new HttpError(409, "TARGET_TOO_LOW", "Số tiền đích không được nhỏ hơn số đang phân bổ.");
    if (patch.walletId !== undefined) await requireWallet(db, context.workspaceId, patch.walletId);
    const updated = await db.savingsGoal.update({ where: { id, workspaceId: context.workspaceId }, data: {
      name: patch.name, walletId: patch.walletId, target: patch.target, dueAt,
      archivedAt: patch.archived === undefined ? undefined : patch.archived ? new Date() : null,
    } });
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "UPDATE", entityType: "SAVINGS_GOAL", entityId: id } });
    return { id: updated.id };
  });
}

// Memo allocations are not transfers: the wallet's money and net worth remain unchanged.
export async function allocateGoal(context: UserContext, goalId: string, raw: unknown, idempotencyKey?: string | null) {
  const input = goalAllocationSchema.parse(raw);
  const amount = parseVnd(input.amount);
  if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 128))
    throw new HttpError(400, "IDEMPOTENCY_KEY", "Idempotency-Key phải dài từ 8 đến 128 ký tự.");
  const replay = async () => {
    if (!idempotencyKey) return null;
    const event = await prisma.goalAllocation.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey } });
    if (!event) return null;
    if (event.goalId !== goalId || event.kind !== input.kind || !event.amount.eq(amount) || (event.note ?? "") !== (input.note ?? ""))
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Khóa đã sử dụng cho phân bổ khác.");
    return { id: event.id };
  };
  const previous = await replay();
  if (previous) return previous;
  try {
    return await prisma.$transaction(async db => {
      // Serialize allocations in a workspace so two goals cannot reserve the same funds concurrently.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.workspaceId}))`;
      if (idempotencyKey) {
        const existing = await db.goalAllocation.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey } });
        if (existing) {
          if (existing.goalId !== goalId || existing.kind !== input.kind || !existing.amount.eq(amount) || (existing.note ?? "") !== (input.note ?? ""))
            throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Khóa đã sử dụng cho phân bổ khác.");
          return { id: existing.id };
        }
      }
      const goal = await db.savingsGoal.findFirst({ where: { id: goalId, workspaceId: context.workspaceId, archivedAt: null } });
      if (!goal) throw new HttpError(404, "NOT_FOUND", "Mục tiêu đã lưu trữ hoặc không tồn tại.");
      const allocated = await goalBalance(db, goalId);
      if (input.kind === "RELEASE" && allocated.lt(amount))
        throw new HttpError(409, "INSUFFICIENT_ALLOCATION", "Không thể rút nhiều hơn số đã phân bổ.");
      if (input.kind === "ALLOCATE") {
        if (allocated.plus(amount).gt(goal.target))
          throw new HttpError(409, "TARGET_EXCEEDED", "Phân bổ vượt số tiền mục tiêu.");
        const wallet = await requireWallet(db, context.workspaceId, goal.walletId);
        const postings = await db.posting.groupBy({ by: ["side"], where: {
          ledgerAccountId: wallet.ledgerAccountId, journal: { workspaceId: context.workspaceId, effectiveAt: { lte: new Date() } },
        }, _sum: { amount: true } });
        const walletBalance = postings.reduce((sum, row) => sum.plus(normalAmount("ASSET", row.side, row._sum.amount?.toString() ?? "0")), new Decimal(0));
        const otherGoals = await db.savingsGoal.findMany({ where: { workspaceId: context.workspaceId, walletId: goal.walletId, archivedAt: null }, select: { id: true } });
        const siblingEvents = await db.goalAllocation.groupBy({ by: ["goalId", "kind"], where: { workspaceId: context.workspaceId, goalId: { in: otherGoals.map(g => g.id) } }, _sum: { amount: true } });
        const totalAllocated = siblingEvents.reduce((sum, row) => sum.plus(new Decimal(row._sum.amount?.toString() ?? "0").mul(row.kind === "ALLOCATE" ? 1 : -1)), new Decimal(0));
        if (walletBalance.minus(totalAllocated).lt(amount))
          throw new HttpError(409, "INSUFFICIENT_WALLET_FUNDS", "Ví không đủ số dư chưa phân bổ cho mục tiêu.");
      }
      const event = await db.goalAllocation.create({ data: {
        workspaceId: context.workspaceId, goalId, kind: input.kind as GoalAllocationKind,
        amount: input.amount, note: input.note, createdById: context.userId, idempotencyKey,
      } });
      await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: input.kind, entityType: "GOAL_ALLOCATION", entityId: event.id } });
      return { id: event.id };
    });
  } catch (error) {
    const existing = await replay();
    if (existing) return existing;
    throw error;
  }
}

export async function listGoals(workspaceId: string, includeArchived = false) {
  const [goals, walletRows] = await Promise.all([
    prisma.savingsGoal.findMany({ where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
      include: { wallet: { select: { name: true } }, events: { orderBy: { createdAt: "desc" }, take: 20 } },
      orderBy: { createdAt: "desc" } }),
    prisma.wallet.findMany({ where: { workspaceId }, select: { id: true, ledgerAccountId: true } }),
  ]);
  const totals = await prisma.goalAllocation.groupBy({ by: ["goalId", "kind"], where: { workspaceId }, _sum: { amount: true } });
  const byGoal = new Map<string, Decimal>();
  for (const row of totals) byGoal.set(row.goalId, (byGoal.get(row.goalId) ?? new Decimal(0)).plus(new Decimal(row._sum.amount?.toString() ?? "0").mul(row.kind === "ALLOCATE" ? 1 : -1)));
  const postings = await prisma.posting.groupBy({ by: ["ledgerAccountId", "side"], where: { ledgerAccountId: { in: walletRows.map(w => w.ledgerAccountId) }, journal: { workspaceId, effectiveAt: { lte: new Date() } } },
    _sum: { amount: true } });
  const walletBalances = new Map<string, Decimal>();
  for (const row of postings) walletBalances.set(row.ledgerAccountId, (walletBalances.get(row.ledgerAccountId) ?? new Decimal(0)).plus(normalAmount("ASSET", row.side, row._sum.amount?.toString() ?? "0")));
  const walletById = new Map(walletRows.map(w => [w.id, w.ledgerAccountId]));
  const allocatedByWallet = new Map<string, Decimal>();
  for (const goal of goals) if (!goal.archivedAt) allocatedByWallet.set(goal.walletId, (allocatedByWallet.get(goal.walletId) ?? new Decimal(0)).plus(byGoal.get(goal.id) ?? 0));
  return goals.map(goal => {
    const allocated = byGoal.get(goal.id) ?? new Decimal(0);
    const remaining = Decimal.max(0, new Decimal(goal.target.toString()).minus(allocated));
    const due = goal.dueAt ? localDay(goal.dueAt) : null;
    const daysLeft = goal.dueAt ? Math.max(0, Math.ceil((goal.dueAt.getTime() - Date.now()) / 86400_000)) : null;
    const walletBalance = walletBalances.get(walletById.get(goal.walletId) ?? "") ?? new Decimal(0);
    const walletAllocated = allocatedByWallet.get(goal.walletId) ?? new Decimal(0);
    return {
      id: goal.id, name: goal.name, walletId: goal.walletId, walletName: goal.wallet.name,
      target: money(goal.target.toString()), allocated: money(allocated), remaining: money(remaining),
      progress: allocated.div(goal.target.toString()).mul(100).toDecimalPlaces(2).toString(),
      dueDate: due, daysLeft, archived: !!goal.archivedAt,
      monthlyNeeded: daysLeft !== null && remaining.gt(0) ? money(remaining.mul(30).div(Math.max(daysLeft, 1)).ceil()) : null,
      walletUnderfunded: walletAllocated.gt(walletBalance),
      events: goal.events.map(e => ({ id: e.id, kind: e.kind, amount: money(e.amount.toString()), note: e.note, createdAt: e.createdAt.toISOString() })),
    };
  });
}
