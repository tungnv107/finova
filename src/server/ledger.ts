import { EntrySide, Prisma, Transaction } from "@finova/prisma";
import { Decimal, money, normalAmount } from "@/lib/money";
import { HttpError, type UserContext } from "@/server/context";
import { prisma } from "@/lib/db";
import { serializable } from "@/server/serializable";
import { walletEdit, walletInput, refundInput, transactionEdit, transactionInput } from "@/schemas/finance";
import type { z } from "zod";
import { categorySubtreeIds } from "@/lib/category-subtree";

type DB = Prisma.TransactionClient;
type Line = { ledgerAccountId: string; side: EntrySide; amount: Decimal; currency?: string };

export function validateBalanced(lines: Line[]) {
  if (lines.length < 2) throw new HttpError(422, "UNBALANCED", "Bút toán phải có ít nhất hai dòng.");
  const debit = lines.filter((p) => p.side === "DEBIT").reduce((s, p) => s.add(p.amount), new Decimal(0));
  const credit = lines.filter((p) => p.side === "CREDIT").reduce((s, p) => s.add(p.amount), new Decimal(0));
  if (!debit.eq(credit) || lines.some((p) => !p.amount.isInteger() || !p.amount.gt(0) || (p.currency ?? "VND") !== "VND")) {
    throw new HttpError(422, "UNBALANCED", "Bút toán không cân hoặc tiền tệ không hợp lệ.");
  }
}

export async function post(db: DB, input: { workspaceId: string; transactionId?: string; walletId?: string; destinationWalletId?: string; kind: string; effectiveAt: Date; reversedJournalId?: string; lines: Line[] }) {
  validateBalanced(input.lines);
  const uniqueIds = [...new Set(input.lines.map((p) => p.ledgerAccountId))];
  const validAccounts = await db.ledgerAccount.count({ where: { workspaceId: input.workspaceId, currency: "VND", id: { in: uniqueIds } } });
  if (validAccounts !== uniqueIds.length) throw new HttpError(422, "ACCOUNT_SCOPE", "Tài khoản sổ cái ngoài phạm vi.");
  return db.journal.create({
    data: {
      workspaceId: input.workspaceId, transactionId: input.transactionId, walletId: input.walletId, destinationWalletId: input.destinationWalletId,
      kind: input.kind, effectiveAt: input.effectiveAt, reversedJournalId: input.reversedJournalId,
      postings: { create: input.lines.map((p) => ({ ledgerAccountId: p.ledgerAccountId, side: p.side, amount: money(p.amount), currency: "VND" })) },
    },
  });
}

async function getEquity(db: DB, workspaceId: string) {
  return db.ledgerAccount.upsert({
    where: { workspaceId_code: { workspaceId, code: "EQUITY_OPENING" } },
    create: { workspaceId, code: "EQUITY_OPENING", name: "Vốn/số dư đầu kỳ", kind: "EQUITY" }, update: {},
  });
}

export async function createWallet(context: UserContext, raw: z.infer<typeof walletInput>) {
  const input = walletInput.parse(raw);
  if (input.type === "SAVINGS" && input.name.length > 80) throw new HttpError(400, "INVALID", "Tên ví quá dài.");
  return prisma.$transaction(async (db) => {
    const ledger = await db.ledgerAccount.create({ data: { workspaceId: context.workspaceId, code: `WALLET_${crypto.randomUUID()}`, name: input.name, kind: "ASSET" } });
    const wallet = await db.wallet.create({ data: {
      workspaceId: context.workspaceId, ledgerAccountId: ledger.id, name: input.name,
      type: input.type, currency: "VND", note: input.note,
    } });
    const opening = new Decimal(input.openingBalance);
    if (opening.gt(0)) {
      const equity = await getEquity(db, context.workspaceId);
      await post(db, { workspaceId: context.workspaceId, walletId: wallet.id, kind: "OPENING", effectiveAt: new Date(input.openingDate), lines: [
        { ledgerAccountId: ledger.id, side: "DEBIT", amount: opening },
        { ledgerAccountId: equity.id, side: "CREDIT", amount: opening },
      ] });
    }
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "CREATE", entityType: "WALLET", entityId: wallet.id } });
    return wallet;
  });
}

export async function updateWallet(context: UserContext, walletId: string, raw: z.infer<typeof walletEdit>) {
  const input = walletEdit.parse(raw);
  return prisma.$transaction(async (db) => {
    const existing = await db.wallet.findFirst({ where: { id: walletId, workspaceId: context.workspaceId } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy ví.");
    const wallet = await db.wallet.update({ where: { id: existing.id, workspaceId: context.workspaceId }, data: {
      name: input.name ?? existing.name,
      archivedAt: input.archived === undefined ? existing.archivedAt : input.archived ? new Date() : null,
      includeInAvailable: input.includeInAvailable ?? existing.includeInAvailable,
    } });
    if (input.name !== undefined && input.name !== existing.name) {
      await db.ledgerAccount.update({ where: { id: existing.ledgerAccountId, workspaceId: context.workspaceId }, data: { name: input.name } });
    }
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "UPDATE", entityType: "WALLET", entityId: wallet.id } });
    return wallet;
  });
}

type EntrySpec = { kind: "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND"; amount: Decimal; walletAccountId: string; categoryAccountId?: string; destinationAccountId?: string; feeAmount?: Decimal; feeAccountId?: string };
export function transactionLines(spec: EntrySpec): Line[] {
  const { amount, walletAccountId, categoryAccountId, destinationAccountId } = spec;
  if (spec.kind === "INCOME" && categoryAccountId) return [
    { ledgerAccountId: walletAccountId, side: "DEBIT", amount },
    { ledgerAccountId: categoryAccountId, side: "CREDIT", amount },
  ];
  if (spec.kind === "EXPENSE" && categoryAccountId) return [
    { ledgerAccountId: categoryAccountId, side: "DEBIT", amount },
    { ledgerAccountId: walletAccountId, side: "CREDIT", amount },
  ];
  if (spec.kind === "REFUND" && categoryAccountId) return [
    { ledgerAccountId: walletAccountId, side: "DEBIT", amount },
    { ledgerAccountId: categoryAccountId, side: "CREDIT", amount },
  ];
  if (spec.kind === "TRANSFER" && destinationAccountId && destinationAccountId !== walletAccountId) {
    const fee = spec.feeAmount ?? new Decimal(0);
    if (!fee.isInteger() || fee.isNegative() || (fee.gt(0) && (!spec.feeAccountId || spec.feeAccountId === walletAccountId || spec.feeAccountId === destinationAccountId))) {
      throw new HttpError(422, "INVALID_TRANSFER_FEE", "Phí chuyển tiền hoặc tài khoản chi phí không hợp lệ.");
    }
    return [
      { ledgerAccountId: destinationAccountId, side: "DEBIT", amount },
      ...(fee.gt(0) ? [{ ledgerAccountId: spec.feeAccountId!, side: "DEBIT" as const, amount: fee }] : []),
      { ledgerAccountId: walletAccountId, side: "CREDIT", amount: amount.plus(fee) },
    ];
  }
  throw new HttpError(422, "INVALID_TRANSACTION", "Thông tin ví, danh mục hoặc loại giao dịch không hợp lệ.");
}

async function resolveEntries(db: DB, workspaceId: string, input: z.infer<typeof transactionInput>): Promise<Line[]> {
  const wallet = await db.wallet.findFirst({ where: { id: input.walletId, workspaceId, archivedAt: null } });
  if (!wallet) throw new HttpError(422, "INVALID_WALLET", "Ví không tồn tại hoặc đã lưu trữ.");
  let categoryAccountId: string | undefined;
  let destinationAccountId: string | undefined;
  let feeAccountId: string | undefined;
  if (input.kind === "TRANSFER") {
    const to = await db.wallet.findFirst({ where: { id: input.destinationWalletId, workspaceId, archivedAt: null } });
    if (!to || to.id === wallet.id) throw new HttpError(422, "INVALID_TRANSFER", "Cần hai ví khác nhau trong cùng tài khoản.");
    destinationAccountId = to.ledgerAccountId;
    if (new Decimal(input.feeAmount ?? "0").gt(0)) {
      const account = await db.ledgerAccount.upsert({
        where: { workspaceId_code: { workspaceId, code: "EXPENSE_TRANSFER_FEE" } },
        create: { workspaceId, code: "EXPENSE_TRANSFER_FEE", name: "Phí chuyển tiền", kind: "EXPENSE" },
        update: {},
      });
      feeAccountId = account.id;
    }
  } else {
    const category = await db.category.findFirst({ where: { id: input.categoryId, workspaceId, kind: input.kind === "INCOME" ? "INCOME" : "EXPENSE", archivedAt: null } });
    if (!category) throw new HttpError(422, "INVALID_CATEGORY", "Danh mục không thuộc loại giao dịch.");
    categoryAccountId = category.ledgerAccountId;
  }
  return transactionLines({ kind: input.kind, amount: new Decimal(input.amount), walletAccountId: wallet.ledgerAccountId, categoryAccountId, destinationAccountId, feeAmount: new Decimal(input.feeAmount ?? "0"), feeAccountId });
}

export async function createTransaction(context: UserContext, raw: z.infer<typeof transactionInput>, idempotencyKey?: string | null) {
  const input = transactionInput.parse(raw);
  validateIdempotencyKey(idempotencyKey);
  if (idempotencyKey) {
    const existing = await prisma.transaction.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey } });
    if (existing) return matchingTransaction(existing, input);
  }
  try {
    return await serializable(db => createTransactionInDb(db, context, input, idempotencyKey));
  } catch (error) {
    // Concurrent idempotent replay must return the first committed transaction.
    if (idempotencyKey) {
      const existing = await prisma.transaction.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey } });
      if (existing) return matchingTransaction(existing, input);
    }
    throw error;
  }
}

function validateIdempotencyKey(idempotencyKey?: string | null) {
  if (idempotencyKey && (idempotencyKey.length > 128 || idempotencyKey.length < 8)) throw new HttpError(400, "IDEMPOTENCY_KEY", "Idempotency-Key không hợp lệ.");
}

function matchingTransaction(existing: Transaction, input: z.infer<typeof transactionInput>) {
    if (existing.kind !== input.kind || !existing.amount.eq(input.amount) || !existing.feeAmount.eq(input.feeAmount ?? "0") || existing.walletId !== input.walletId ||
        (existing.destinationWalletId ?? undefined) !== (input.destinationWalletId ?? undefined) ||
        (existing.categoryId ?? undefined) !== (input.categoryId ?? undefined) ||
        existing.occurredAt.getTime() !== new Date(input.occurredAt).getTime() ||
        (existing.note ?? "") !== (input.note ?? "") ||
        JSON.stringify(existing.tags) !== JSON.stringify(input.tags ?? [])) {
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Khóa giao dịch đã được sử dụng cho nội dung khác.");
    }
    return existing;
}

/** Compose ledger posting with an enclosing business-state transaction. No nested transactions. */
export async function createTransactionInDb(db: DB, context: UserContext, raw: z.infer<typeof transactionInput>, idempotencyKey?: string | null) {
  const input = transactionInput.parse(raw);
  validateIdempotencyKey(idempotencyKey);
  if (idempotencyKey) {
    const existing = await db.transaction.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey } });
    if (existing) return matchingTransaction(existing, input);
  }
      const lines = await resolveEntries(db, context.workspaceId, input);
      const transaction = await db.transaction.create({ data: {
        workspaceId: context.workspaceId, createdById: context.userId, ...input,
        amount: input.amount, feeAmount: input.kind === "TRANSFER" ? (input.feeAmount ?? "0") : "0", tags: input.tags ?? [],
        occurredAt: new Date(input.occurredAt), currency: "VND", idempotencyKey,
      } });
      await post(db, { workspaceId: context.workspaceId, transactionId: transaction.id, walletId: input.walletId, destinationWalletId: input.destinationWalletId, kind: "POSTED", effectiveAt: transaction.occurredAt, lines });
      await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "CREATE", entityType: "TRANSACTION", entityId: transaction.id } });
      return transaction;
}

async function reverse(db: DB, journalId: string, workspaceId: string, transactionId: string) {
  const prior = await db.journal.findFirst({ where: { id: journalId, workspaceId }, include: { postings: true, reversal: true } });
  if (!prior || prior.reversal) throw new HttpError(409, "ALREADY_REVERSED", "Bút toán đã được điều chỉnh.");
  return post(db, { workspaceId, transactionId, walletId: prior.walletId ?? undefined, destinationWalletId: prior.destinationWalletId ?? undefined, kind: "REVERSAL", effectiveAt: prior.effectiveAt, reversedJournalId: prior.id,
    lines: prior.postings.map((p) => ({ ledgerAccountId: p.ledgerAccountId, amount: new Decimal(p.amount.toString()), side: p.side === "DEBIT" ? "CREDIT" : "DEBIT" })),
  });
}

export async function editTransaction(context: UserContext, id: string, raw: z.infer<typeof transactionEdit>) {
  const input = transactionEdit.parse(raw);
  return serializable(async (db) => {
    const existing = await db.transaction.findFirst({ where: { id, workspaceId: context.workspaceId, status: "ACTIVE" } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy giao dịch.");
    const bankLink = await db.bankTransactionLink.findFirst({ where: { workspaceId: context.workspaceId, transactionId: id }, select: { id: true } });
    if (bankLink && (existing.kind !== input.kind || !existing.amount.eq(input.amount) || existing.walletId !== input.walletId ||
      (existing.destinationWalletId ?? undefined) !== (input.destinationWalletId ?? undefined) ||
      !existing.feeAmount.eq(input.feeAmount ?? "0") || existing.occurredAt.getTime() !== new Date(input.occurredAt).getTime())) {
      throw new HttpError(422, "IMMUTABLE_BANK_SOURCE", "Giao dịch có nguồn sao kê chỉ được sửa danh mục, nhãn và ghi chú.");
    }
    if (existing.version !== input.version) throw new HttpError(409, "VERSION_CONFLICT", "Giao dịch đã được chỉnh sửa. Vui lòng tải lại.");
    if (existing.kind === "REFUND" || existing.kind !== input.kind) throw new HttpError(422, "EDIT_KIND", "Không thể đổi bản chất giao dịch.");
    const refunds = await db.transaction.count({ where: { workspaceId: context.workspaceId, originalTransactionId: id, status: "ACTIVE" } });
    if (refunds) throw new HttpError(422, "HAS_REFUNDS", "Vui lòng hủy khoản hoàn tiền trước khi chỉnh sửa giao dịch gốc.");
    const original = await db.journal.findFirst({ where: { workspaceId: context.workspaceId, transactionId: id, kind: { in: ["POSTED", "REPLACEMENT"] }, reversal: null }, orderBy: { postedAt: "desc" } });
    if (!original) throw new HttpError(409, "MISSING_JOURNAL", "Không xác định được bút toán gốc.");
    const lines = await resolveEntries(db, context.workspaceId, input);
    await reverse(db, original.id, context.workspaceId, id);
    const result = await db.transaction.update({ where: { id, workspaceId: context.workspaceId }, data: {
      amount: input.amount, walletId: input.walletId, destinationWalletId: input.destinationWalletId,
      feeAmount: input.kind === "TRANSFER" ? (input.feeAmount ?? "0") : "0",
      categoryId: input.categoryId, note: input.note, tags: input.tags ?? existing.tags,
      occurredAt: new Date(input.occurredAt), version: { increment: 1 },
    } });
    await post(db, { workspaceId: context.workspaceId, transactionId: id, walletId: input.walletId, destinationWalletId: input.destinationWalletId, kind: "REPLACEMENT", effectiveAt: result.occurredAt, lines });
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "EDIT", entityType: "TRANSACTION", entityId: id } });
    return result;
  });
}

export async function voidTransaction(context: UserContext, id: string, version: number) {
  return serializable(async (db) => {
    const existing = await db.transaction.findFirst({ where: { id, workspaceId: context.workspaceId, status: "ACTIVE" } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy giao dịch.");
    if (await db.bankTransactionLink.count({ where: { workspaceId: context.workspaceId, transactionId: id } })) {
      throw new HttpError(422, "BANK_SOURCE_LOCKED", "Không thể xóa giao dịch có chứng từ ngân hàng; cần quy trình điều chỉnh/đảo giao dịch.");
    }
    if (existing.version !== version) throw new HttpError(409, "VERSION_CONFLICT", "Giao dịch đã thay đổi.");
    if (await db.transaction.count({ where: { workspaceId: context.workspaceId, originalTransactionId: id, status: "ACTIVE" } })) {
      throw new HttpError(422, "HAS_REFUNDS", "Hủy khoản hoàn tiền trước khi hủy khoản chi gốc.");
    }
    const original = await db.journal.findFirst({ where: { workspaceId: context.workspaceId, transactionId: id, kind: { in: ["POSTED", "REPLACEMENT"] }, reversal: null }, orderBy: { postedAt: "desc" } });
    if (!original) throw new HttpError(409, "MISSING_JOURNAL", "Không tìm thấy bút toán hợp lệ.");
    await reverse(db, original.id, context.workspaceId, id);
    const result = await db.transaction.update({ where: { id, workspaceId: context.workspaceId }, data: { status: "VOID", version: { increment: 1 } } });
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "VOID", entityType: "TRANSACTION", entityId: id } });
    return result;
  });
}

export async function refundTransaction(context: UserContext, originalId: string, raw: z.infer<typeof refundInput>, idempotencyKey?: string | null) {
  const input = refundInput.parse(raw);
  if (idempotencyKey && (idempotencyKey.length > 128 || idempotencyKey.length < 8)) throw new HttpError(400, "IDEMPOTENCY_KEY", "Idempotency-Key không hợp lệ.");
  const existingMatches = (old: Transaction) => {
    if (old.kind !== "REFUND" || old.originalTransactionId !== originalId || !old.amount.eq(input.amount) || (old.note ?? "") !== (input.note ?? "")) {
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Khóa hoàn tiền đã được sử dụng cho nội dung khác.");
    }
    return old;
  };
  try {
    return await serializable(async (db) => {
    if (idempotencyKey) {
      const old = await db.transaction.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey } });
      if (old) return existingMatches(old);
    }
    const original = await db.transaction.findFirst({ where: { id: originalId, workspaceId: context.workspaceId, kind: "EXPENSE", status: "ACTIVE" } });
    if (!original) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy khoản chi gốc.");
    const refunded = await db.transaction.aggregate({ where: { workspaceId: context.workspaceId, originalTransactionId: originalId, status: "ACTIVE" }, _sum: { amount: true } });
    const left = new Decimal(original.amount.toString()).minus(refunded._sum.amount?.toString() ?? "0");
    if (new Decimal(input.amount).gt(left)) throw new HttpError(422, "REFUND_EXCEEDS_EXPENSE", "Số hoàn vượt phần chi chưa hoàn.");
    const wallet = await db.wallet.findFirst({ where: { id: original.walletId, workspaceId: context.workspaceId, archivedAt: null } });
    const category = await db.category.findFirst({ where: { id: original.categoryId ?? undefined, workspaceId: context.workspaceId } });
    if (!wallet || !category) throw new HttpError(422, "REFUND_TARGET", "Ví hoặc danh mục gốc không còn khả dụng.");
    const transaction = await db.transaction.create({ data: {
      workspaceId: context.workspaceId, createdById: context.userId, kind: "REFUND", amount: input.amount,
      walletId: wallet.id, categoryId: category.id, originalTransactionId: originalId,
      occurredAt: new Date(), note: input.note, idempotencyKey,
    } });
    await post(db, { workspaceId: context.workspaceId, transactionId: transaction.id, walletId: wallet.id, kind: "POSTED", effectiveAt: transaction.occurredAt,
      lines: transactionLines({ kind: "REFUND", amount: new Decimal(input.amount), walletAccountId: wallet.ledgerAccountId, categoryAccountId: category.ledgerAccountId }),
    });
    await db.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: context.userId, action: "REFUND", entityType: "TRANSACTION", entityId: transaction.id } });
    return transaction;
    });
  } catch (error) {
    // Sau khi một request đồng thời commit thành công, trả lại đúng giao dịch đã tạo.
    if (idempotencyKey) {
      const existing = await prisma.transaction.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey } });
      if (existing) return existingMatches(existing);
    }
    throw error;
  }
}

export async function walletBalances(workspaceId: string, before = new Date()) {
  const wallets = await prisma.wallet.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  const postings = await prisma.posting.groupBy({ by: ["ledgerAccountId", "side"],
    where: { account: { workspaceId, kind: "ASSET" }, journal: { workspaceId, effectiveAt: { lt: before } } },
    _sum: { amount: true },
  });
  const amounts = new Map<string, Decimal>();
  for (const p of postings) {
    amounts.set(p.ledgerAccountId, (amounts.get(p.ledgerAccountId) ?? new Decimal(0)).add(normalAmount("ASSET", p.side, p._sum.amount?.toString() ?? "0")));
  }
  return wallets.map((w) => ({ id: w.id, name: w.name, type: w.type, currency: w.currency, archived: Boolean(w.archivedAt), includeInAvailable: w.includeInAvailable, balance: money(amounts.get(w.ledgerAccountId) ?? 0) }));
}

type TransactionFilters = { from?: Date; to?: Date; kind?: "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND"; walletId?: string; categoryId?: string; categoryScope?: "direct" | "subtree"; includeRefunds?: boolean; feeOnly?: boolean; search?: string; sort?: "asc" | "desc"; limit?: number; cursor?: string };

export async function listTransactionsPage(workspaceId: string, filters: TransactionFilters) {
  const limit = filters.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "INVALID_LIMIT", "Số giao dịch mỗi trang phải từ 1 đến 100.");
  if (filters.feeOnly && (filters.kind !== "TRANSFER" || filters.categoryId || filters.includeRefunds)) throw new HttpError(400, "INVALID_FEE_FILTER", "Bộ lọc phí chỉ áp dụng cho giao dịch chuyển ví.");
  if (filters.walletId && !(await prisma.wallet.count({ where: { workspaceId, id: filters.walletId } }))) throw new HttpError(404, "NOT_FOUND", "Ví không thuộc tài khoản của bạn.");
  if (filters.categoryId && !(await prisma.category.count({ where: { workspaceId, id: filters.categoryId } }))) throw new HttpError(404, "NOT_FOUND", "Danh mục không thuộc tài khoản của bạn.");
  const categoryIds = filters.categoryId && filters.categoryScope === "subtree"
    ? categorySubtreeIds(await prisma.category.findMany({ where: { workspaceId }, select: { id: true, parentId: true } }), filters.categoryId)
    : null;
  const where: Prisma.TransactionWhereInput = {
    workspaceId, status: "ACTIVE", kind: filters.includeRefunds && filters.kind === "EXPENSE" ? { in: ["EXPENSE", "REFUND"] } : filters.kind,
    occurredAt: (filters.from && filters.to) ? { gte: filters.from, lt: filters.to } : undefined,
    // A transfer fee is charged to the source wallet; destination-wallet filters
    // must not include fees that were not deducted from that wallet.
    OR: filters.walletId && !filters.feeOnly ? [{ walletId: filters.walletId }, { destinationWalletId: filters.walletId }] : undefined,
    walletId: filters.walletId && filters.feeOnly ? filters.walletId : undefined,
    categoryId: categoryIds ? { in: categoryIds } : filters.categoryId,
    feeAmount: filters.feeOnly ? { gt: 0 } : undefined,
    note: filters.search ? { contains: filters.search, mode: "insensitive" } : undefined,
  };
  if (filters.cursor && !(await prisma.transaction.count({ where: { ...where, id: filters.cursor } }))) {
    throw new HttpError(400, "INVALID_CURSOR", "Trang giao dịch đã thay đổi. Vui lòng tải lại bộ lọc.");
  }
  const sort = filters.sort ?? "desc";
  const page = await prisma.transaction.findMany({ where, orderBy: [{ occurredAt: sort }, { id: sort }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}), take: limit + 1 });
  const rows = page.slice(0, limit);
  const nextCursor = page.length > limit ? rows.at(-1)!.id : null;
  const walletIds = [...new Set(rows.flatMap((row) => [row.walletId, row.destinationWalletId].filter((x): x is string => Boolean(x))))];
  const [wallets, categories] = await Promise.all([
    prisma.wallet.findMany({ where: { workspaceId, id: { in: walletIds } }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { workspaceId, id: { in: rows.map((r) => r.categoryId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
  ]);
  const walletNames = new Map(wallets.map((w) => [w.id, w.name]));
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const items = rows.map((r) => ({
    id: r.id, kind: r.kind, status: r.status, amount: money(r.amount.toString()), feeAmount: money(r.feeAmount?.toString() ?? "0"),
    walletId: r.walletId, walletName: walletNames.get(r.walletId) ?? "Ví đã lưu trữ",
    destinationWalletId: r.destinationWalletId, destinationWalletName: r.destinationWalletId ? walletNames.get(r.destinationWalletId) : undefined,
    categoryId: r.categoryId, categoryName: r.categoryId ? categoryNames.get(r.categoryId) : undefined,
    originalTransactionId: r.originalTransactionId, occurredAt: r.occurredAt.toISOString(), note: r.note, tags: r.tags, version: r.version,
  }));
  return { items, nextCursor };
}

export async function listTransactions(workspaceId: string, filters: TransactionFilters) {
  return (await listTransactionsPage(workspaceId, filters)).items;
}
