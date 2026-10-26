import { prisma } from "../src/lib/db";
import { seedPremiumCatalogAndLiteSubscriptions } from "../src/modules/billing/seed";

async function main() {
  const { checkedUsers, createdSubscriptions } = await seedPremiumCatalogAndLiteSubscriptions();
  console.log(`Premium catalog: 29.000 VNĐ/tháng, 199.000 VNĐ/năm; Lite backfill ${checkedUsers} users (${createdSubscriptions} mới).`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
