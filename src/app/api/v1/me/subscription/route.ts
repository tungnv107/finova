import { requireContext } from "@/server/context";
import { getEffectiveSubscription, premiumEnforced } from "@/server/premium";
import { failure, respond } from "@/server/http";

export async function GET() {
  try {
    const context = await requireContext();
    const subscription = await getEffectiveSubscription(context.userId);
    const allowed = !premiumEnforced() || subscription.plan === "PREMIUM";
    return respond({ ...subscription, features: {
      STATEMENT_IMPORT: allowed, BANK_SYNC: allowed, NOTIFICATIONS: allowed,
    } });
  } catch (error) { return failure(error); }
}
