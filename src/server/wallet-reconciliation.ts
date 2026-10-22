import { Prisma } from "@finova/prisma";
import { Decimal, money, normalAmount } from "@/lib/money";
import { prisma } from "@/lib/db";
import { HttpError, type UserContext } from "@/server/context";
import { post } from "@/server/ledger";
import { serializable } from "@/server/serializable";
import { walletReconciliationInput } from "@/schemas/finance";

type ReconciliationRow = {
  id: string; walletId: string; expectedBalance: Prisma.Decimal;
  actualBalance: Prisma.Decimal; delta: Prisma.Decimal; reason: string;
  journalId: string | null; createdAt: Date;
};

function view(row: ReconciliationRow) {
  return {
    id: row.id, walletId: row.walletId, expectedBalance: money(row.expectedBalance.toString()),
    actualBalance: money(row.actualBalance.toString()), delta: money(row.delta.toString()),
    reason: row.reason, journalId: row.journalId, createdAt: row.createdAt.toISOString(),
  };
}

function replay(row: ReconciliationRow & { idempotencyKey: string }, walletId: string, input: ReturnType<typeof walletReconciliationInput.parse>) {
  if (row.walletId !== walletId || !row.expectedBalance.eq(input.expectedBalance) ||
      !row.actualBalance.eq(input.actualBalance) || row.reason !== input.reason) {
    throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Khóa đối soát đã dùng cho nội dung khác.");
  }
  return view(row);
}

export async function listWalletReconciliations(workspaceId: string, walletId: string) {
  const wallet = await prisma.wallet.findFirst({ where: { workspaceId, id: walletId }, select: { id: true } });
  if (!wallet) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy ví.");
  const rows = await prisma.walletReconciliation.findMany({
    where: { workspaceId, walletId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
  });
  return rows.map(view);
}

/** Adjustment is a balance-sheet correction against equity, never fabricated income/expense. */
export async function reconcileWallet(context: UserContext, walletId: string, raw: unknown) {
  const input = walletReconciliationInput.parse(raw);
  return serializable(async db => {
    const prior = await db.walletReconciliation.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: input.idempotencyKey } });
    if (prior) return replay(prior, walletId, input);

    const wallet = await db.wallet.findFirst({ where: { id: walletId, workspaceId: context.workspaceId, archivedAt: null } });
    if (!wallet) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy ví đang hoạt động.");
    const now = new Date();
    const postings = await db.posting.groupBy({
      by: ["side"],
      // Current wallet balances use an exclusive cutoff. Keep reconciliation's
      // optimistic snapshot check on the same boundary as the balances API.
      where: { ledgerAccountId: wallet.ledgerAccountId, journal: { workspaceId: context.workspaceId, effectiveAt: { lt: now } } },
      _sum: { amount: true },
    });
    const current = postings.reduce((sum, row) => sum.plus(normalAmount("ASSET", row.side, row._sum.amount?.toString() ?? "0")), new Decimal(0));
    if (!current.eq(input.expectedBalance)) {
      throw new HttpError(409, "STALE_WALLET_BALANCE", "Số dư ví đã thay đổi. Hãy tải lại số dư rồi đối soát.");
    }
    const delta = new Decimal(input.actualBalance).minus(current);
    let journalId: string | null = null;
    if (!delta.isZero()) {
      const equity = await db.ledgerAccount.upsert({
        where: { workspaceId_code: { workspaceId: context.workspaceId, code: "EQUITY_RECONCILIATION" } },
        create: { workspaceId: context.workspaceId, code: "EQUITY_RECONCILIATION", name: "Chênh lệch kiểm kê ví", kind: "EQUITY" }, update: {},
      });
      const absolute = delta.abs();
      const journal = await post(db, {
        workspaceId: context.workspaceId, walletId, kind: "RECONCILIATION", effectiveAt: now,
        lines: delta.gt(0)
          ? [{ ledgerAccountId: wallet.ledgerAccountId, side: "DEBIT", amount: absolute }, { ledgerAccountId: equity.id, side: "CREDIT", amount: absolute }]
          : [{ ledgerAccountId: equity.id, side: "DEBIT", amount: absolute }, { ledgerAccountId: wallet.ledgerAccountId, side: "CREDIT", amount: absolute }],
      });
      journalId = journal.id;
    }
    const row = await db.walletReconciliation.create({ data: {
      workspaceId: context.workspaceId, walletId, createdById: context.userId,
      expectedBalance: money(current), actualBalance: input.actualBalance, delta: money(delta),
      reason: input.reason, idempotencyKey: input.idempotencyKey, journalId,
    } });
    await db.auditLog.create({ data: {
      workspaceId: context.workspaceId, actorId: context.userId,
      action: "RECONCILE", entityType: "WALLET_RECONCILIATION", entityId: row.id,
    } });
    return view(row);
  });
}
