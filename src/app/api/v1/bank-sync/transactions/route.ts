import { NextRequest } from "next/server";
import { requireBankSyncContext } from "@/server/premium";
import { failure, respond } from "@/server/http";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const context = await requireBankSyncContext(request);
    const items = await prisma.bankTransaction.findMany({ where: { workspaceId: context.workspaceId },
      orderBy: { occurredAt: "desc" }, take: 50, include: { account: { select: { accountMasked: true,
        connection: { select: { providerCode: true } } } }, links: { select: { transactionId: true } } } });
    return respond(items.map(t => ({ id: t.id, direction: t.direction, amount: t.amount.toFixed(0), currency: t.currency,
      occurredAt: t.occurredAt, description: t.descriptionRaw, bookingStatus: t.bookingStatus, processingStatus: t.processingStatus,
      accountMasked: t.account.accountMasked, providerCode: t.account.connection.providerCode, source: "BANK_SYNC", transactionIds: t.links.map(l => l.transactionId) })));
  } catch (error) { return failure(error); }
}
