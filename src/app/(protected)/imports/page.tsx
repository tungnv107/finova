import { requirePageContext, requirePremiumPage } from "@/server/page-context";
import { prisma } from "@/lib/db";
import { walletBalances } from "@/server/ledger";
import { ImportManager } from "@/components/import-manager";

export default async function ImportsPage() {
  const { workspaceId, userId } = await requirePageContext();
  await requirePremiumPage(userId, "STATEMENT_IMPORT");
  const [wallets, categories, batches] = await Promise.all([
    walletBalances(workspaceId),
    prisma.category.findMany({ where: { workspaceId, archivedAt: null }, select: { id: true, name: true, kind: true } }),
    prisma.importBatch.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, fileName: true, status: true, createdAt: true } }),
  ]);
  return <ImportManager wallets={wallets.filter(w => !w.archived).map(w => ({ id: w.id, name: w.name }))} categories={categories} batches={batches} />;
}
