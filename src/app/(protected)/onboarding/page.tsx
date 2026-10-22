import { redirect } from "next/navigation";
import { requirePageContext } from "@/server/page-context";
import { prisma } from "@/lib/db";
import { WalletManager } from "@/components/wallet-manager";

export default async function OnboardingPage() {
  const ctx = await requirePageContext();
  const existingWallet = await prisma.wallet.findFirst({ where: { workspaceId: ctx.workspaceId }, select: { id: true } });
  if (existingWallet) redirect("/dashboard");
  return <WalletManager wallets={[]} onboarding />;
}
