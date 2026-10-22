import { requirePageContext } from "@/server/page-context";
import { prisma } from "@/lib/db";
import { listBankConnections, listBankReviews } from "@/modules/bank-sync/service";
import { isSandboxEnabled } from "@/modules/bank-sync/domain";
import { sepayEnabled } from "@/modules/bank-sync/sepay/client";
import { BankSyncManager } from "@/components/bank-sync-manager";

export default async function BankSyncPage() {
  const context = await requirePageContext();
  const defaultCutoverDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [wallets, categories, connections, reviews, sources, transactions] = await Promise.all([
    prisma.wallet.findMany({ where: { workspaceId: context.workspaceId, archivedAt: null }, select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { workspaceId: context.workspaceId, archivedAt: null, kind: { in: ["INCOME", "EXPENSE"] } },
      select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }),
    listBankConnections(context.workspaceId),
    listBankReviews(context.workspaceId),
    prisma.bankTransaction.findMany({ where: { workspaceId: context.workspaceId }, orderBy: { occurredAt: "desc" }, take: 50,
      include: { account: { select: { accountMasked: true, connection: { select: { providerCode: true } } } },
        links: { select: { transactionId: true } } } }),
    prisma.transaction.findMany({ where: { workspaceId: context.workspaceId, status: "ACTIVE" },
      orderBy: { occurredAt: "desc" }, take: 100, select: { id: true, kind: true, amount: true, walletId: true,
        destinationWalletId: true, occurredAt: true, note: true } }),
  ]);
  return <BankSyncManager wallets={wallets} categories={categories} connections={connections} reviews={reviews} defaultCutoverDay={defaultCutoverDay}
    sources={sources.map(s => ({ id: s.id, amount: s.amount.toFixed(0), direction: s.direction, description: s.descriptionRaw,
      occurredAt: s.occurredAt.toISOString(), processingStatus: s.processingStatus, bookingStatus: s.bookingStatus,
      accountMasked: s.account.accountMasked, providerCode: s.account.connection.providerCode, linkedIds: s.links.map(l => l.transactionId),
      bankReference: s.bankReference, sourceVersion: s.sourceVersion, receivedAt: s.receivedAt.toISOString(), rawEventId: s.rawEventId }))}
    transactions={transactions.map(t => ({ ...t, amount: t.amount.toFixed(0), occurredAt: t.occurredAt.toISOString() }))}
    sandboxEnabled={isSandboxEnabled()} sepayEnabled={sepayEnabled()} />;
}
