import { DebtDirection, Prisma } from "@finova/prisma";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { localDay, vndDayStart } from "@/lib/dates";
import { Decimal, money } from "@/lib/money";
import { projectedDebtSchedule } from "@/lib/debt-schedule";
import { HttpError, type UserContext } from "@/server/context";
import { post } from "@/server/ledger";
import { activeWallet, balanceOfAccount, interestLedger, positiveVnd, validateKey } from "@/server/finance-accounts";

const amount = z.string().regex(positiveVnd);
const nonnegative = z.string().regex(/^(0|[1-9]\d{0,15})$/);
export const debtInput = z.object({
  direction: z.enum(["BORROW", "LEND"]), counterparty: z.string().trim().min(1).max(120),
  walletId: z.string().min(1), principal: amount, annualRate: z.number().min(0).max(100),
  installmentCount: z.number().int().min(1).max(360).default(1),
  startDate: z.iso.date(), dueDate: z.iso.date().nullable(), note: z.string().trim().max(500).optional(),
}).strict();
export const debtPaymentInput = z.object({ walletId: z.string().min(1), principal: nonnegative, interest: nonnegative,
  date: z.iso.date(), }).strict().refine(x => x.principal !== "0" || x.interest !== "0", "Cần có tiền gốc hoặc lãi.");
export const debtEditInput = z.object({ counterparty: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).nullable().optional(), dueDate: z.iso.date().nullable().optional() }).strict()
  .refine(x => Object.values(x).some(v => v !== undefined), "Không có nội dung cập nhật.");

const basis = (direction: DebtDirection) => direction === "BORROW" ? "LIABILITY" as const : "RECEIVABLE" as const;

export async function createDebt(context: UserContext, raw: unknown) {
  const input = debtInput.parse(raw);
  const startAt = vndDayStart(input.startDate);
  const dueAt = input.dueDate ? vndDayStart(input.dueDate) : null;
  if (startAt > new Date() || (dueAt && dueAt < startAt)) throw new HttpError(400, "INVALID_DATE", "Ngày giải ngân/hạn trả không hợp lệ.");
  return prisma.$transaction(async db => {
    const wallet = await activeWallet(db, context.workspaceId, input.walletId);
    const ledger = await db.ledgerAccount.create({ data: { workspaceId: context.workspaceId, code: `DEBT_${crypto.randomUUID()}`,
      name: `${input.direction === "BORROW" ? "Vay" : "Cho vay"}: ${input.counterparty}`, kind: basis(input.direction) } });
    const principal = new Decimal(input.principal);
    const journal = await post(db, { workspaceId: context.workspaceId, walletId: wallet.id, kind: "DEBT_ORIGINATION", effectiveAt: startAt, lines:
      input.direction === "BORROW" ? [
        { ledgerAccountId: wallet.ledgerAccountId, side: "DEBIT", amount: principal },
        { ledgerAccountId: ledger.id, side: "CREDIT", amount: principal },
      ] : [
        { ledgerAccountId: ledger.id, side: "DEBIT", amount: principal },
        { ledgerAccountId: wallet.ledgerAccountId, side: "CREDIT", amount: principal },
      ] });
    const debt = await db.debtContract.create({ data: {
      workspaceId: context.workspaceId, walletId: wallet.id, ledgerAccountId: ledger.id, originationJournalId: journal.id,
      direction: input.direction, counterparty: input.counterparty, principal: input.principal,
      annualRate: input.annualRate, installmentCount: input.installmentCount, startAt, dueAt, note: input.note,
    } });
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "CREATE", entityType: "DEBT", entityId: debt.id } });
    return { id: debt.id };
  });
}

export async function updateDebt(context: UserContext, id: string, raw: unknown) {
  const input = debtEditInput.parse(raw);
  return prisma.$transaction(async db => {
    const debt = await db.debtContract.findFirst({ where: { id, workspaceId: context.workspaceId } });
    if (!debt) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy khoản vay/nợ.");
    const dueAt = input.dueDate === undefined ? undefined : input.dueDate === null ? null : vndDayStart(input.dueDate);
    if (dueAt && dueAt < debt.startAt) throw new HttpError(400, "INVALID_DATE", "Hạn trả phải sau ngày giải ngân.");
    await db.debtContract.update({ where: { id, workspaceId: context.workspaceId }, data: { counterparty: input.counterparty, note: input.note, dueAt } });
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "UPDATE", entityType: "DEBT", entityId: id } });
    return { id };
  });
}

export async function payDebt(context: UserContext, debtId: string, raw: unknown, key?: string | null) {
  const input = debtPaymentInput.parse(raw);
  validateKey(key);
  const at = vndDayStart(input.date);
  if (at > new Date()) throw new HttpError(400, "INVALID_DATE", "Không thể ghi thanh toán tương lai như đã thực hiện.");
  const principal = new Decimal(input.principal), interest = new Decimal(input.interest);
  const matches = (p: { debtId: string; walletId: string; principal: Prisma.Decimal; interest: Prisma.Decimal; effectiveAt: Date }) => {
    if (p.debtId !== debtId || p.walletId !== input.walletId || !p.principal.eq(principal) || !p.interest.eq(interest) || p.effectiveAt.getTime() !== at.getTime())
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Khóa đã dùng cho thanh toán khác.");
    return { id: "" };
  };
  const replay = async () => {
    const p = key ? await prisma.debtPayment.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: key } }) : null;
    if (!p) return null;
    matches(p); return { id: p.id };
  };
  const prior = await replay(); if (prior) return prior;
  try {
    return await prisma.$transaction(async db => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.workspaceId}))`;
      const existing = key ? await db.debtPayment.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: key } }) : null;
      if (existing) { matches(existing); return { id: existing.id }; }
      const debt = await db.debtContract.findFirst({ where: { id: debtId, workspaceId: context.workspaceId } });
      if (!debt) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy khoản vay/nợ.");
      if (at < debt.startAt) throw new HttpError(400, "INVALID_DATE", "Thanh toán trước ngày giải ngân.");
      const wallet = await activeWallet(db, context.workspaceId, input.walletId);
      const outstanding = await balanceOfAccount(db, context.workspaceId, debt.ledgerAccountId, basis(debt.direction));
      if (principal.gt(outstanding) || (outstanding.isZero() && interest.gt(0)))
        throw new HttpError(409, "DEBT_OVERPAYMENT", "Tiền gốc vượt dư nợ hoặc khoản vay đã tất toán.");
      const lines: { ledgerAccountId: string; side: "DEBIT" | "CREDIT"; amount: Decimal }[] = [];
      if (principal.gt(0)) {
        lines.push({ ledgerAccountId: debt.ledgerAccountId, side: debt.direction === "BORROW" ? "DEBIT" : "CREDIT", amount: principal });
      }
      if (interest.gt(0)) {
        const interestAccount = await interestLedger(db, context.workspaceId, debt.direction === "BORROW" ? "EXPENSE" : "INCOME");
        lines.push({ ledgerAccountId: interestAccount.id, side: debt.direction === "BORROW" ? "DEBIT" : "CREDIT", amount: interest });
      }
      lines.push({ ledgerAccountId: wallet.ledgerAccountId, side: debt.direction === "BORROW" ? "CREDIT" : "DEBIT", amount: principal.plus(interest) });
      const journal = await post(db, { workspaceId: context.workspaceId, walletId: wallet.id, kind: "DEBT_PAYMENT", effectiveAt: at, lines });
      const payment = await db.debtPayment.create({ data: { workspaceId: context.workspaceId, debtId, walletId: wallet.id,
        journalId: journal.id, principal: input.principal, interest: input.interest, effectiveAt: at, idempotencyKey: key } });
      await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "PAYMENT", entityType: "DEBT", entityId: debtId } });
      return { id: payment.id };
    });
  } catch (error) { const existing = await replay(); if (existing) return existing; throw error; }
}

export async function listDebts(workspaceId: string) {
  const contracts = await prisma.debtContract.findMany({ where: { workspaceId }, include: {
    wallet: { select: { name: true } }, payments: { orderBy: { effectiveAt: "desc" }, include: { wallet: { select: { name: true } } } },
  }, orderBy: { createdAt: "desc" } });
  return Promise.all(contracts.map(async d => {
    const outstanding = await balanceOfAccount(prisma, workspaceId, d.ledgerAccountId, basis(d.direction));
    const remaining = Decimal.max(0, outstanding);
    const now = new Date();
    const daysUntilDue = d.dueAt ? Math.ceil((d.dueAt.getTime() - now.getTime()) / 86400_000) : null;
    const instalment = remaining.div(d.installmentCount).ceil();
    const monthlyInterestEstimate = remaining.mul(d.annualRate.toString()).div(1200).toDecimalPlaces(0);
    return { id: d.id, direction: d.direction, counterparty: d.counterparty, walletId: d.walletId, walletName: d.wallet.name,
      principal: money(d.principal.toString()), remaining: money(remaining), annualRate: d.annualRate.toString(),
      installmentCount: d.installmentCount, startDate: localDay(d.startAt), dueDate: d.dueAt ? localDay(d.dueAt) : null,
      daysUntilDue, overdue: daysUntilDue !== null && daysUntilDue < 0 && remaining.gt(0), settled: remaining.isZero(),
      principalInstallmentEstimate: money(instalment), monthlyInterestEstimate: money(monthlyInterestEstimate), note: d.note,
      projectedSchedule: projectedDebtSchedule(d.principal.toString(), d.annualRate.toString(), d.installmentCount,
        localDay(d.startAt), d.dueAt ? localDay(d.dueAt) : null),
      payments: d.payments.map(p => ({ id: p.id, date: localDay(p.effectiveAt), principal: money(p.principal.toString()),
        interest: money(p.interest.toString()), walletName: p.wallet.name })),
    };
  }));
}
