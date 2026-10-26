import { redirect } from "next/navigation";
import { assertUserActive, getContext } from "@/server/context";
import { hasPremiumFeature } from "@/server/premium";
import type { PremiumFeature } from "@/modules/billing/domain";

/** Page-level guard: layouts and pages can render concurrently in App Router. */
export async function requirePageContext() {
  const context = await getContext();
  if (!context) redirect("/login");
  await assertUserActive(context.userId);
  return context;
}

export async function requirePremiumPage(userId: string, feature: PremiumFeature) {
  if (!await hasPremiumFeature(userId, feature)) redirect("/pricing");
}
