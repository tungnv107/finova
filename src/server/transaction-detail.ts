import { prisma } from "@/lib/db";
import { money } from "@/lib/money";

/** A detail link may point outside the active date filter or cursor page. */
export async function transactionDetail(workspaceId: string, transactionId: string) {
  if (transactionId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(transactionId)) return null;
  const row = await prisma.transaction.findFirst({
    where: { workspaceId, id: transactionId, status: "ACTIVE" },
    include: {
      wallet: { select: { name: true } },
      destinationWallet: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id, kind: row.kind, amount: money(row.amount.toString()), feeAmount: money(row.feeAmount.toString()),
    walletId: row.walletId, walletName: row.wallet.name,
    destinationWalletId: row.destinationWalletId, destinationWalletName: row.destinationWallet?.name,
    categoryId: row.categoryId, categoryName: row.category?.name,
    originalTransactionId: row.originalTransactionId,
    occurredAt: row.occurredAt.toISOString(), note: row.note, tags: row.tags, version: row.version,
  };
}
