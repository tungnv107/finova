import { prisma } from "@/lib/db";
import { localDay } from "@/lib/dates";
import { requirePageContext } from "@/server/page-context";
import { listCreditCards } from "@/server/credit-cards";
import { walletBalances } from "@/server/ledger";
import { CardsManager } from "@/components/cards-manager";

export default async function CardsPage() {
  const ctx = await requirePageContext();
  const [cards, wallets, categories] = await Promise.all([
    listCreditCards(ctx.workspaceId), walletBalances(ctx.workspaceId),
    prisma.category.findMany({ where: { workspaceId: ctx.workspaceId, kind: "EXPENSE", archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <CardsManager cards={cards} wallets={wallets.filter(w => !w.archived)} categories={categories} today={localDay(new Date())} />;
}
