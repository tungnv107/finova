import { requirePageContext } from "@/server/page-context";
import { prisma } from "@/lib/db";
import { generateOccurrences, listRecurring } from "@/server/recurring";
import { walletBalances } from "@/server/ledger";
import { RecurringManager } from "@/components/recurring-manager";

export default async function RecurringPage() {
  const context = await requirePageContext();
  await generateOccurrences(context.workspaceId);
  const [data, wallets, categories] = await Promise.all([
    listRecurring(context.workspaceId),
    walletBalances(context.workspaceId),
    prisma.category.findMany({ where: { workspaceId: context.workspaceId, archivedAt: null }, select: { id: true, name: true, kind: true } }),
  ]);
  return <RecurringManager data={data} wallets={wallets.filter(w => !w.archived).map(w => ({ id: w.id, name: w.name }))} categories={categories} />;
}
