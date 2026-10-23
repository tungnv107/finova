/* Recover only synthetic integration fixtures left by an interrupted test cleanup. */
import { prisma } from "../src/lib/db";
import { cleanupBankSyncFixture } from "./bank-sync-fixture-cleanup";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.FINOVA_TEST_RUN !== "1" || process.env.FINOVA_CLEANUP_FIXTURES !== "1" ||
      process.env.NODE_ENV === "production" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !["finova", "finova_test"].includes(url.pathname.slice(1))) {
    throw new Error("Fixture cleanup requires explicit flags and a local Finova development database.");
  }

  const workspaces = await prisma.workspace.findMany({
    where: { OR: [{ id: { startsWith: "integration-" } }, { id: { startsWith: "personal-integration-" } }] },
    include: { creator: true, memberships: true },
  });
  // Validate every candidate before changing any data. Real accounts must never be selected.
  for (const workspace of workspaces) {
    const integrationUser = /^integration-[0-9a-f-]{36}$/.test(workspace.createdById);
    const expectedId = workspace.id === `personal-${workspace.createdById}` || /^integration-[0-9a-f-]{36}$/.test(workspace.id);
    const expectedName = ["Integration test", "Cá nhân · Bootstrap Concurrent"].includes(workspace.name);
    const creator = workspace.creator;
    if (!integrationUser || !expectedId || !expectedName ||
        !creator || creator.email !== `${creator.id}@example.invalid` ||
        !["Finova Integration", "Bootstrap Concurrent"].includes(creator.name) ||
        workspace.memberships.some(m => m.userId !== creator.id)) {
      throw new Error(`Workspace ${workspace.id} does not meet the synthetic-fixture safety criteria.`);
    }
  }

  const userIds = [...new Set(workspaces.map(workspace => workspace.createdById))];
  for (const { id: workspaceId } of workspaces) {
    await cleanupBankSyncFixture(workspaceId);
    await prisma.walletReconciliation.deleteMany({ where: { workspaceId } });
    await prisma.notification.deleteMany({ where: { workspaceId } });
    await prisma.recurringOccurrence.deleteMany({ where: { workspaceId } });
    await prisma.recurringRule.deleteMany({ where: { workspaceId } });
    await prisma.importRow.deleteMany({ where: { workspaceId } });
    await prisma.importBatch.deleteMany({ where: { workspaceId } });
    await prisma.cardEntry.deleteMany({ where: { workspaceId } });
    await prisma.creditCard.deleteMany({ where: { workspaceId } });
    await prisma.debtPayment.deleteMany({ where: { workspaceId } });
    await prisma.debtContract.deleteMany({ where: { workspaceId } });
    await prisma.$transaction(async db => {
      await db.posting.deleteMany({ where: { journal: { workspaceId } } });
      await db.journal.deleteMany({ where: { workspaceId } });
    });
    await prisma.transaction.deleteMany({ where: { workspaceId } });
    await prisma.goalAllocation.deleteMany({ where: { workspaceId } });
    await prisma.savingsGoal.deleteMany({ where: { workspaceId } });
    await prisma.budget.deleteMany({ where: { workspaceId } });
    await prisma.wallet.deleteMany({ where: { workspaceId } });
    await prisma.category.deleteMany({ where: { workspaceId } });
    await prisma.ledgerAccount.deleteMany({ where: { workspaceId } });
    await prisma.membership.deleteMany({ where: { workspaceId } });
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(`Removed ${workspaces.length} verified synthetic integration workspaces and ${userIds.length} test users.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
