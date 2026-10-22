import { requirePageContext } from "@/server/page-context";
import { listDebts } from "@/server/debts";
import { walletBalances } from "@/server/ledger";
import { localDay } from "@/lib/dates";
import { DebtsManager } from "@/components/debts-manager";

export default async function DebtsPage() {
  const ctx = await requirePageContext();
  const [debts, wallets] = await Promise.all([listDebts(ctx.workspaceId), walletBalances(ctx.workspaceId)]);
  return <DebtsManager debts={debts} wallets={wallets.filter(w => !w.archived)} today={localDay(new Date())} />;
}
