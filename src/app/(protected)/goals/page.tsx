import { requirePageContext } from "@/server/page-context";
import { listGoals } from "@/server/goals";
import { walletBalances } from "@/server/ledger";
import { GoalsManager } from "@/components/goals-manager";

export default async function GoalsPage() {
  const context = await requirePageContext();
  const [goals, wallets] = await Promise.all([listGoals(context.workspaceId, true), walletBalances(context.workspaceId)]);
  return <GoalsManager goals={goals} wallets={wallets.filter(w => !w.archived)} />;
}
