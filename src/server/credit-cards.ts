import { CardEntryKind, Prisma } from "@finova/prisma";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { cycleDates, localDay, vndDayStart } from "@/lib/dates";
import { estimatedStatementRemaining } from "@/lib/card-statements";
import { Decimal, money } from "@/lib/money";
import { HttpError, type UserContext } from "@/server/context";
import { post } from "@/server/ledger";
import { activeWallet, balanceOfAccount, positiveVnd, validateKey } from "@/server/finance-accounts";

const amount = z.string().regex(positiveVnd);
const date = z.iso.date();
export const cardInput = z.object({ name: z.string().trim().min(1).max(100), lastFour: z.string().regex(/^\d{4}$/).nullable(),
  creditLimit: amount, openingDebt: z.string().regex(/^(0|[1-9]\d{0,15})$/),
  statementDay: z.number().int().min(1).max(28), paymentDueDay: z.number().int().min(1).max(28) }).strict();
export const cardEditInput = z.object({ name: z.string().trim().min(1).max(100).optional(), creditLimit: amount.optional(),
  statementDay: z.number().int().min(1).max(28).optional(), paymentDueDay: z.number().int().min(1).max(28).optional() }).strict()
  .refine(x => Object.values(x).some(v => v !== undefined), "Không có nội dung cập nhật.");
export const cardEntryInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PURCHASE"), amount, categoryId: z.string().min(1), date, note: z.string().trim().max(300).optional() }).strict(),
  z.object({ kind: z.literal("REFUND"), amount, originalEntryId: z.string().min(1), date, note: z.string().trim().max(300).optional() }).strict(),
  z.object({ kind: z.literal("PAYMENT"), amount, walletId: z.string().min(1), date, note: z.string().trim().max(300).optional() }).strict(),
]);

export async function createCreditCard(context: UserContext, raw: unknown) {
  const input = cardInput.parse(raw);
  const opening = new Decimal(input.openingDebt), limit = new Decimal(input.creditLimit);
  if (opening.gt(limit)) throw new HttpError(400, "OPENING_EXCEEDS_LIMIT", "Dư nợ đầu kỳ vượt hạn mức thẻ.");
  return prisma.$transaction(async db => {
    const ledger = await db.ledgerAccount.create({ data: { workspaceId: context.workspaceId, code: `CARD_${crypto.randomUUID()}`,
      name: `Thẻ tín dụng: ${input.name}`, kind: "LIABILITY" } });
    const card = await db.creditCard.create({ data: { workspaceId: context.workspaceId, ledgerAccountId: ledger.id,
      name: input.name, lastFour: input.lastFour, creditLimit: input.creditLimit, openingDebt: input.openingDebt,
      statementDay: input.statementDay, paymentDueDay: input.paymentDueDay } });
    if (opening.gt(0)) {
      const equity = await db.ledgerAccount.upsert({ where: { workspaceId_code: { workspaceId: context.workspaceId, code: "EQUITY_OPENING" } },
        create: { workspaceId: context.workspaceId, code: "EQUITY_OPENING", name: "Vốn/số dư đầu kỳ", kind: "EQUITY" }, update: {} });
      await post(db, { workspaceId: context.workspaceId, kind: "CARD_OPENING", effectiveAt: new Date(), lines: [
        { ledgerAccountId: equity.id, side: "DEBIT", amount: opening },
        { ledgerAccountId: ledger.id, side: "CREDIT", amount: opening },
      ] });
    }
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "CREATE", entityType: "CREDIT_CARD", entityId: card.id } });
    return { id: card.id };
  });
}

export async function updateCreditCard(context: UserContext, id: string, raw: unknown) {
  const input = cardEditInput.parse(raw);
  return prisma.$transaction(async db => {
    // Serialize limit changes with purchases and payments in the same workspace.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.workspaceId}))`;
    const card = await db.creditCard.findFirst({ where: { id, workspaceId: context.workspaceId } });
    if (!card) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy thẻ tín dụng.");
    const outstanding = await balanceOfAccount(db, context.workspaceId, card.ledgerAccountId, "LIABILITY");
    if (input.creditLimit && new Decimal(input.creditLimit).lt(outstanding))
      throw new HttpError(409, "LIMIT_TOO_LOW", "Hạn mức mới nhỏ hơn dư nợ hiện tại.");
    await db.creditCard.update({ where: { id, workspaceId: context.workspaceId }, data: input });
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "UPDATE", entityType: "CREDIT_CARD", entityId: id } });
    return { id };
  });
}

export async function createCardEntry(context: UserContext, cardId: string, raw: unknown, key?: string | null) {
  const input = cardEntryInput.parse(raw);
  validateKey(key);
  const effectiveAt = vndDayStart(input.date);
  if (effectiveAt > new Date()) throw new HttpError(400, "INVALID_DATE", "Không thể ghi trước một giao dịch tương lai.");
  const value = new Decimal(input.amount);
  const matches = (e: { cardId: string; kind: CardEntryKind; amount: Prisma.Decimal; effectiveAt: Date; walletId: string | null;
    categoryId: string | null; originalEntryId: string | null; note: string | null }) => {
    if (e.cardId !== cardId || e.kind !== input.kind || !e.amount.eq(value) || e.effectiveAt.getTime() !== effectiveAt.getTime()
      || (e.note ?? "") !== (input.note ?? "") || (input.kind === "PAYMENT" && e.walletId !== input.walletId)
      || (input.kind === "PURCHASE" && e.categoryId !== input.categoryId)
      || (input.kind === "REFUND" && e.originalEntryId !== input.originalEntryId))
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Khóa đã dùng cho nghiệp vụ thẻ khác.");
  };
  const replay = async () => {
    const existing = key ? await prisma.cardEntry.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: key } }) : null;
    if (!existing) return null;
    matches(existing); return { id: existing.id };
  };
  const previous = await replay(); if (previous) return previous;
  try {
    return await prisma.$transaction(async db => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.workspaceId}))`;
      const old = key ? await db.cardEntry.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: key } }) : null;
      if (old) { matches(old); return { id: old.id }; }
      const card = await db.creditCard.findFirst({ where: { id: cardId, workspaceId: context.workspaceId } });
      if (!card) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy thẻ tín dụng.");
      const outstanding = await balanceOfAccount(db, context.workspaceId, card.ledgerAccountId, "LIABILITY");
      let categoryId: string | undefined;
      let walletId: string | undefined;
      let originalEntryId: string | undefined;
      let otherLedgerId: string;
      if (input.kind === "PURCHASE") {
        if (outstanding.plus(value).gt(card.creditLimit)) throw new HttpError(409, "CARD_LIMIT", "Khoản mua vượt hạn mức còn lại.");
        const category = await db.category.findFirst({ where: { id: input.categoryId, workspaceId: context.workspaceId, kind: "EXPENSE", archivedAt: null } });
        if (!category) throw new HttpError(400, "INVALID_CATEGORY", "Danh mục chi tiêu không hợp lệ.");
        categoryId = category.id; otherLedgerId = category.ledgerAccountId;
      } else if (input.kind === "REFUND") {
        const original = await db.cardEntry.findFirst({ where: { id: input.originalEntryId, workspaceId: context.workspaceId, cardId, kind: "PURCHASE" } });
        if (!original || !original.categoryId) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy giao dịch mua gốc.");
        const refunds = await db.cardEntry.aggregate({ where: { workspaceId: context.workspaceId, originalEntryId: original.id, kind: "REFUND" }, _sum: { amount: true } });
        if (value.gt(new Decimal(original.amount.toString()).minus(refunds._sum.amount?.toString() ?? "0")))
          throw new HttpError(409, "REFUND_EXCEEDED", "Hoàn tiền vượt số tiền mua chưa hoàn.");
        if (value.gt(outstanding)) throw new HttpError(409, "CARD_CREDIT", "Hoàn tiền vượt dư nợ; hãy liên hệ ngân hàng nếu thẻ đã được thanh toán.");
        categoryId = original.categoryId; originalEntryId = original.id;
        const category = await db.category.findFirst({ where: { id: categoryId, workspaceId: context.workspaceId } });
        if (!category) throw new HttpError(400, "INVALID_CATEGORY", "Danh mục gốc không hợp lệ.");
        otherLedgerId = category.ledgerAccountId;
      } else {
        if (value.gt(outstanding)) throw new HttpError(409, "CARD_OVERPAYMENT", "Thanh toán vượt dư nợ thẻ.");
        const wallet = await activeWallet(db, context.workspaceId, input.walletId);
        walletId = wallet.id; otherLedgerId = wallet.ledgerAccountId;
      }
      const lines = input.kind === "PURCHASE" ? [
        { ledgerAccountId: otherLedgerId, side: "DEBIT" as const, amount: value },
        { ledgerAccountId: card.ledgerAccountId, side: "CREDIT" as const, amount: value },
      ] : [
        { ledgerAccountId: card.ledgerAccountId, side: "DEBIT" as const, amount: value },
        { ledgerAccountId: otherLedgerId, side: "CREDIT" as const, amount: value },
      ];
      const journal = await post(db, { workspaceId: context.workspaceId, walletId, kind: `CARD_${input.kind}`, effectiveAt, lines });
      const entry = await db.cardEntry.create({ data: { workspaceId: context.workspaceId, cardId, kind: input.kind,
        amount: input.amount, categoryId, walletId, originalEntryId, journalId: journal.id, effectiveAt,
        note: input.note, idempotencyKey: key } });
      await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: input.kind, entityType: "CARD_ENTRY", entityId: entry.id } });
      return { id: entry.id };
    });
  } catch (error) { const old = await replay(); if (old) return old; throw error; }
}

export async function listCreditCards(workspaceId: string) {
  const now = new Date();
  const cards = await prisma.creditCard.findMany({ where: { workspaceId }, include: {
    entries: { orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 60,
      include: { wallet: { select: { name: true } }, category: { select: { name: true } } } },
  }, orderBy: { createdAt: "desc" } });
  return Promise.all(cards.map(async card => {
    const outstanding = await balanceOfAccount(prisma, workspaceId, card.ledgerAccountId, "LIABILITY", now);
    const cycle = cycleDates(localDay(now), card.statementDay, card.paymentDueDay);
    // Snapshot at end of closing day in Vietnam. A card's current balance may
    // include purchases made after this closing date; keep both amounts distinct.
    const lastStatementEnd = new Date(cycle.start.getTime() - 1);
    const lastStatementBalance = await balanceOfAccount(prisma, workspaceId, card.ledgerAccountId, "LIABILITY", lastStatementEnd);
    const currentEntries = await prisma.cardEntry.findMany({ where: { workspaceId, cardId: card.id,
      effectiveAt: { gte: cycle.start, lte: now } }, select: { kind: true, amount: true,
        originalEntry: { select: { effectiveAt: true } } } });
    const netPurchases = currentEntries.reduce((s, e) => s.plus(new Decimal(e.amount.toString()).mul(e.kind === "PURCHASE" ? 1 : e.kind === "REFUND" ? -1 : 0)), new Decimal(0));
    const statementRemaining = estimatedStatementRemaining(money(lastStatementBalance), lastStatementEnd,
      currentEntries.map(e => ({ kind: e.kind, amount: e.amount.toString(), originalPurchaseDate: e.originalEntry?.effectiveAt })));
    return { id: card.id, name: card.name, lastFour: card.lastFour, creditLimit: money(card.creditLimit.toString()),
      openingDebt: money(card.openingDebt.toString()), outstanding: money(outstanding),
      available: money(Decimal.max(0, new Decimal(card.creditLimit.toString()).minus(outstanding))),
      statementDay: card.statementDay, paymentDueDay: card.paymentDueDay,
      lastStatementDate: cycle.lastStatementDate, lastStatementBalance: money(lastStatementBalance),
      estimatedStatementRemaining: statementRemaining,
      lastPaymentDueDate: cycle.lastPaymentDueDate,
      currentCycleNetPurchases: money(netPurchases), nextStatementDate: cycle.nextCloseDate,
      projectedPaymentDueDate: cycle.projectedDueDate,
      entries: card.entries.map(e => ({ id: e.id, kind: e.kind, amount: money(e.amount.toString()),
        date: localDay(e.effectiveAt), note: e.note, categoryName: e.category?.name ?? null, walletName: e.wallet?.name ?? null,
        originalEntryId: e.originalEntryId })),
    };
  }));
}
