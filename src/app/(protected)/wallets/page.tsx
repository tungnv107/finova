import { requirePageContext } from "@/server/page-context";
import { walletBalances } from "@/server/ledger";
import { WalletManager } from "@/components/wallet-manager";

export default async function WalletsPage() {
  const context = await requirePageContext();
  return <WalletManager wallets={await walletBalances(context.workspaceId)} />;
}
