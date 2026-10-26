import { prisma } from "@/lib/db";
import { INITIAL_PRICES, PREMIUM_FEATURES } from "./domain";

/** Idempotent catalog and Lite backfill. Existing paid projections are never overwritten. */
export async function seedPremiumCatalogAndLiteSubscriptions() {
  await prisma.subscriptionPlan.upsert({ where: { code: "LITE" }, create: { code: "LITE", displayName: "Lite" }, update: {} });
  await prisma.subscriptionPlan.upsert({ where: { code: "PREMIUM" }, create: { code: "PREMIUM", displayName: "Premium" }, update: {} });
  for (const price of INITIAL_PRICES) {
    await prisma.planPrice.upsert({ where: { productCode_version: { productCode: price.productCode, version: 1 } },
      create: { ...price, planCode: "PREMIUM", version: 1, isPublished: true, publishedAt: new Date() }, update: {} });
  }
  for (const planCode of ["LITE", "PREMIUM"] as const) for (const featureKey of PREMIUM_FEATURES) {
    await prisma.planEntitlement.upsert({ where: { planCode_featureKey_policyVersion: { planCode, featureKey, policyVersion: 1 } },
      create: { planCode, featureKey, enabled: planCode === "PREMIUM" }, update: {} });
  }

  let lastUserId: string | undefined;
  let checkedUsers = 0;
  let createdSubscriptions = 0;
  while (true) {
    // Bounded batches avoid loading the entire user table into memory.
    const users = await prisma.user.findMany({
      select: { id: true }, orderBy: { id: "asc" }, take: 500,
      ...(lastUserId ? { cursor: { id: lastUserId }, skip: 1 } : {}),
    });
    if (!users.length) break;
    const inserted = await prisma.subscription.createMany({
      data: users.map(u => ({ userId: u.id, planCode: "LITE" })), skipDuplicates: true,
    });
    checkedUsers += users.length;
    createdSubscriptions += inserted.count;
    lastUserId = users[users.length - 1].id;
    if (users.length < 500) break;
  }
  return { checkedUsers, createdSubscriptions };
}
