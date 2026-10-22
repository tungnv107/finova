import { z } from "zod";
import { prisma } from "@/lib/db";
import { localDay, vndDayStart } from "@/lib/dates";
import { scheduleDates } from "@/lib/recurrence";
import { parseVnd } from "@/lib/money";
import { HttpError, type UserContext } from "@/server/context";
import { createTransactionInDb } from "@/server/ledger";
import { serializable } from "@/server/serializable";

const fields = z.object({
  name: z.string().trim().min(1).max(100),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.number().int().min(1).max(365),
  mode: z.enum(["AUTO", "CONFIRM"]),
  kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  walletId: z.string().min(1),
  destinationWalletId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  amount: z.string().regex(/^[1-9]\d{0,15}$/),
  note: z.string().max(1000).optional(),
  startDate: z.iso.date(),
  endDate: z.iso.date().nullable(),
}).strict();
export const recurringInput = fields;
export const recurringEdit = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  paused: z.boolean().optional(),
  endDate: z.iso.date().nullable().optional(),
}).strict().refine(v => Object.keys(v).length > 0);

export async function createRule(context: UserContext, raw: unknown) {
  const input = fields.parse(raw);
  parseVnd(input.amount);
  if (input.endDate && input.endDate < input.startDate) throw new HttpError(400, "DATE_RANGE", "Ngày kết thúc trước ngày bắt đầu.");
  const today = localDay(new Date());
  const earliest = localDay(new Date(Date.now() - 31 * 86400_000));
  if (input.startDate < earliest) throw new HttpError(400, "START_TOO_OLD", "Ngày bắt đầu chỉ được lùi tối đa 31 ngày.");
  return prisma.$transaction(async tx => {
    const wallet = await tx.wallet.findFirst({ where: { id: input.walletId, workspaceId: context.workspaceId, archivedAt: null } });
    if (!wallet) throw new HttpError(422, "INVALID_WALLET", "Ví không tồn tại hoặc đã lưu trữ.");
    if (input.kind === "TRANSFER") {
      const dest = await tx.wallet.findFirst({ where: { id: input.destinationWalletId ?? "", workspaceId: context.workspaceId, archivedAt: null } });
      if (!dest || dest.id === wallet.id || input.categoryId) throw new HttpError(422, "INVALID_TRANSFER", "Chọn ví nhận khác ví nguồn.");
    } else {
      const category = await tx.category.findFirst({ where: { id: input.categoryId ?? "", workspaceId: context.workspaceId, archivedAt: null, kind: input.kind } });
      if (!category || input.destinationWalletId) throw new HttpError(422, "INVALID_CATEGORY", "Danh mục không phù hợp loại giao dịch.");
    }
    const rule = await tx.recurringRule.create({ data: {
      workspaceId: context.workspaceId, name: input.name, frequency: input.frequency, interval: input.interval,
      mode: input.mode, kind: input.kind, walletId: input.walletId,
      destinationWalletId: input.destinationWalletId || null, categoryId: input.categoryId || null,
      amount: input.amount, note: input.note, startDate: input.startDate, endDate: input.endDate,
    } });
    await tx.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "CREATE", entityType: "RECURRING_RULE", entityId: rule.id } });
    return { id: rule.id, startDate: rule.startDate, today };
  });
}

export async function updateRule(context: UserContext, id: string, raw: unknown) {
  const patch = recurringEdit.parse(raw);
  return serializable(async db => {
    const rule = await db.recurringRule.findFirst({ where: { id, workspaceId: context.workspaceId } });
    if (!rule) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy lịch định kỳ.");
    if (patch.endDate && patch.endDate < rule.startDate) throw new HttpError(400, "DATE_RANGE", "Ngày kết thúc trước ngày bắt đầu.");
    await db.recurringRule.update({ where: { id, workspaceId: context.workspaceId }, data: patch });
    if (patch.endDate) {
      // Forecast rows are derived, unposted data. Drop periods that no longer
      // belong to the rule so a later extension can regenerate them normally.
      await db.recurringOccurrence.deleteMany({ where: {
        workspaceId: context.workspaceId, ruleId: id, periodKey: { gt: patch.endDate },
        status: { in: ["PENDING", "PROCESSING"] }, transactionId: null,
      } });
    }
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "UPDATE", entityType: "RECURRING_RULE", entityId: id } });
    return { id };
  });
}

// Does not post future occurrences or place predictions into financial journals.
export async function generateOccurrences(workspaceId: string, now = new Date()) {
  const today = localDay(now);
  const horizon = localDay(new Date(now.getTime() + 90 * 86400_000));
  const rules = await prisma.recurringRule.findMany({ where: { workspaceId, paused: false }, select: { id: true } });
  let generated = 0;
  for (const rule of rules) {
    generated += await serializable(async db => {
      // Re-read the rule in the same serializable transaction as the forecast
      // insert. An edit that shortens/pauses it must not race a stale snapshot.
      const current = await db.recurringRule.findFirst({ where: { id: rule.id, workspaceId, paused: false } });
      if (!current) return 0;
      const days = scheduleDates(current.startDate, current.endDate, current.frequency, current.interval, horizon);
      if (!days.length) return 0;
      const result = await db.recurringOccurrence.createMany({
        data: days.map(day => ({ workspaceId, ruleId: current.id, periodKey: day, dueAt: vndDayStart(day) })),
        skipDuplicates: true,
      });
      return result.count;
    });
  }
  return { today, generated };
}

export async function processOccurrence(context: UserContext, id: string, now = new Date(), autoOnly = false) {
  const stale = new Date(now.getTime() - 2 * 60_000);
  return serializable(async db => {
    const occurrence = await db.recurringOccurrence.findFirst({ where: { id, workspaceId: context.workspaceId }, include: { rule: true } });
    if (!occurrence) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy kỳ dự kiến.");
    if (occurrence.status === "POSTED") return { id, status: "POSTED", transactionId: occurrence.transactionId };
    if (occurrence.status === "SKIPPED") throw new HttpError(409, "SKIPPED", "Kỳ đã được bỏ qua.");
    if (occurrence.periodKey < occurrence.rule.startDate ||
        (occurrence.rule.endDate && occurrence.periodKey > occurrence.rule.endDate)) {
      throw new HttpError(409, "RULE_DATE_RANGE", "Kỳ nằm ngoài thời gian hiệu lực của lịch định kỳ.");
    }
    if (occurrence.dueAt > now) throw new HttpError(409, "NOT_DUE", "Chưa đến ngày ghi nhận.");
    if (autoOnly && (occurrence.rule.mode !== "AUTO" || occurrence.rule.paused)) return { id, status: occurrence.status };
    // The claim, ledger posting and occurrence link commit as a single unit.
    const claim = await db.recurringOccurrence.updateMany({ where: { id, workspaceId: context.workspaceId, OR: [
      { status: "PENDING" }, { status: "PROCESSING", processingAt: { lt: stale } },
    ] }, data: { status: "PROCESSING", processingAt: now } });
    if (!claim.count) return { id, status: "PROCESSING" };
    const rule = occurrence.rule;
    const transaction = await createTransactionInDb(db, context, {
      kind: rule.kind as "INCOME" | "EXPENSE" | "TRANSFER", walletId: rule.walletId,
      destinationWalletId: rule.destinationWalletId ?? undefined, categoryId: rule.categoryId ?? undefined,
      amount: rule.amount.toFixed(0), note: rule.note ?? undefined, occurredAt: occurrence.dueAt.toISOString(),
    }, `recurring:${rule.id}:${occurrence.periodKey}`);
    await db.recurringOccurrence.update({ where: { id, workspaceId: context.workspaceId }, data: { status: "POSTED", transactionId: transaction.id, processingAt: null } });
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "POST", entityType: "RECURRING_OCCURRENCE", entityId: id } });
    return { id, status: "POSTED", transactionId: transaction.id };
  });
}

export async function skipOccurrence(context: UserContext, id: string) {
  return serializable(async db => {
    const changed = await db.recurringOccurrence.updateMany({ where: { id, workspaceId: context.workspaceId, status: "PENDING" }, data: { status: "SKIPPED" } });
    if (!changed.count) {
      const owned = await db.recurringOccurrence.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { id: true } });
      if (!owned) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy kỳ dự kiến.");
      throw new HttpError(409, "CANNOT_SKIP", "Chỉ bỏ qua được kỳ đang chờ.");
    }
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "SKIP", entityType: "RECURRING_OCCURRENCE", entityId: id } });
    return { id, status: "SKIPPED" };
  });
}

export async function syncRecurring(context: UserContext, autoPost = true, now = new Date()) {
  const result = await generateOccurrences(context.workspaceId, now);
  const stale = new Date(now.getTime() - 2 * 60_000);
  const due = await prisma.recurringOccurrence.findMany({ where: {
    workspaceId: context.workspaceId, OR: [{ status: "PENDING" }, { status: "PROCESSING", processingAt: { lt: stale } }],
    dueAt: { lte: now }, rule: { paused: false, mode: "AUTO" },
  }, orderBy: { dueAt: "asc" }, take: 100 });
  const errors: string[] = [];
  let posted = 0;
  if (autoPost) for (const row of due) {
    try { if ((await processOccurrence(context, row.id, now, true)).status === "POSTED") posted++; }
    catch { errors.push(row.id); }
  }
  return { ...result, posted, errors };
}

export async function listRecurring(workspaceId: string) {
  const [rules, occurrences] = await Promise.all([
    prisma.recurringRule.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    prisma.recurringOccurrence.findMany({ where: { workspaceId }, include: { rule: { select: { name: true, kind: true, mode: true, paused: true, amount: true } } }, orderBy: { dueAt: "desc" }, take: 250 }),
  ]);
  return { rules: rules.map(r => ({ ...r, amount: r.amount.toFixed(0) })),
    occurrences: occurrences.map(o => ({ ...o, rule: { ...o.rule, amount: o.rule.amount.toFixed(0) } })) };
}

// Used by a protected, opt-in scheduler endpoint. Never runs on a public unauthenticated request.
export async function syncAllRecurring(now = new Date()) {
  const workspaces = await prisma.workspace.findMany({ where: { type: "PERSONAL" }, select: { id: true, createdById: true } });
  const results: { workspaceId: string; generated: number; posted: number; failures: number }[] = [];
  for (const workspace of workspaces) {
    const context = { workspaceId: workspace.id, userId: workspace.createdById, name: "", image: null };
    try {
      const r = await syncRecurring(context, true, now);
      results.push({ workspaceId: workspace.id, generated: r.generated, posted: r.posted, failures: r.errors.length });
    } catch { results.push({ workspaceId: workspace.id, generated: 0, posted: 0, failures: 1 }); }
  }
  return { workspaces: results.length, generated: results.reduce((n, r) => n + r.generated, 0), posted: results.reduce((n, r) => n + r.posted, 0), failures: results.reduce((n, r) => n + r.failures, 0) };
}
