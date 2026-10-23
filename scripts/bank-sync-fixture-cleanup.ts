import { prisma } from "../src/lib/db";

/** Remove bank-sync rows owned by a verified synthetic workspace only. */
export async function cleanupBankSyncFixture(workspaceId: string) {
  if (!/^integration-[0-9a-f-]{36}$/.test(workspaceId) &&
      !/^personal-integration-[0-9a-f-]{36}$/.test(workspaceId)) {
    throw new Error("Refusing to clean a non-integration workspace.");
  }
  const events = await prisma.bankRawEvent.findMany({ where: { workspaceId }, select: { id: true } });
  const eventIds = events.map(event => event.id);
  await prisma.bankTransactionLink.deleteMany({ where: { workspaceId } });
  await prisma.bankReviewItem.deleteMany({ where: { workspaceId } });
  await prisma.bankReconciliationSnapshot.deleteMany({ where: { workspaceId } });
  await prisma.bankCategoryRule.deleteMany({ where: { workspaceId } });
  await prisma.bankTransaction.deleteMany({ where: { workspaceId } });
  if (eventIds.length) await prisma.bankSyncOutbox.deleteMany({ where: { eventType: "BANK_EVENT", aggregateId: { in: eventIds } } });
  await prisma.bankRawEvent.deleteMany({ where: { workspaceId } });
  await prisma.bankSyncJob.deleteMany({ where: { workspaceId } });
  await prisma.bankConsent.deleteMany({ where: { workspaceId } });
  await prisma.bankAuditEvent.deleteMany({ where: { workspaceId } });
  await prisma.bankAccount.deleteMany({ where: { workspaceId } });
  await prisma.bankConnection.deleteMany({ where: { workspaceId } });
}
