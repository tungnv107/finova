/** PostgreSQL-only AD2-03 check. Run after the normal billing integration fixtures on a disposable DB. */
import { prisma } from "../src/lib/db";

const expected = [
  "BillingOrder_amount_positive_check",
  "BillingOrder_period_count_check",
  "BillingOrder_currency_check",
  "BillingOrder_expiry_check",
  "BillingPaymentEvent_amount_positive_check",
  "BillingPaymentEvent_direction_check",
  "BillingPaymentEvent_verification_check",
  "BillingPaymentEvent_match_status_check",
  "BillingPaymentEvent_attempt_count_check",
  "BillingPaymentEvent_lease_pair_check",
  "PaymentAllocation_amount_positive_check",
];
const uniqueIndexes = [
  "BillingOrder_orderCode_key",
  "BillingOrder_userId_idempotencyKey_key",
  "BillingPaymentEvent_provider_providerAccountRef_providerTra_key",
  "PaymentAllocation_paymentEventId_key",
  "PaymentAllocation_orderId_key",
  "BillingOutbox_orderId_key",
  "BillingNotice_outboxId_key",
  "BillingNotice_orderId_key",
];
const lookupIndexes = [
  "BillingOrder_userId_createdAt_idx",
  "BillingOrder_status_expiresAt_idx",
  // PostgreSQL truncates this generated identifier at 63 bytes.
  "BillingPaymentEvent_provider_verificationStatus_matchStatus_dea",
  "BillingOutbox_status_deadLetteredAt_nextAttemptAt_idx",
  "BillingNotice_userId_createdAt_idx",
];
const foreignKeys = [
  "BillingOrder_userId_fkey", "BillingOrder_priceId_fkey", "BillingOrder_receiverAccountId_fkey",
  "PaymentAllocation_paymentEventId_fkey", "PaymentAllocation_orderId_fkey",
  "BillingOutbox_orderId_fkey", "BillingOutbox_userId_fkey",
  "BillingNotice_outboxId_fkey", "BillingNotice_orderId_fkey", "BillingNotice_userId_fkey",
];

async function rejectsWithoutWriting(label: string, action: (db: typeof prisma) => Promise<unknown>) {
  const unexpectedlySucceeded = new Error(`Constraint accepted invalid data: ${label}`);
  try {
    await prisma.$transaction(async db => {
      await action(db as typeof prisma);
      // A broken constraint must not leave a corrupted fixture behind.
      throw unexpectedlySucceeded;
    });
  } catch (error) {
    if (error === unexpectedlySucceeded) throw error;
    // Each statement changes only a valid sample row to violate its one named CHECK.
    // Other DB errors (permission, connectivity, schema mismatch) must remain visible.
    if (!/23514|P2004|check constraint|violates check constraint/i.test(String(error))) throw error;
  }
}

async function main() {
  const pathname = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname;
  if (!/^\/finova_admin_test_schema_[a-zA-Z0-9_]+$/.test(pathname)) {
    throw new Error("AD2-03 requires a disposable finova_admin_test_schema_* database");
  }

  const constraints = await prisma.$queryRaw<{ conname: string; contype: string }[]>`
    SELECT conname, contype::text AS contype FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
  `;
  const present = new Set(constraints.filter(row => row.contype === "c").map(row => row.conname));
  for (const name of expected) if (!present.has(name)) throw new Error(`Missing CHECK: ${name}`);
  const presentFks = new Set(constraints.filter(row => row.contype === "f").map(row => row.conname));
  for (const name of foreignKeys) if (!presentFks.has(name)) throw new Error(`Missing FK: ${name}`);
  const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
  `;
  const byIndex = new Map(indexes.map(row => [row.indexname, row.indexdef]));
  for (const name of uniqueIndexes) {
    if (!byIndex.get(name)?.includes("CREATE UNIQUE INDEX")) throw new Error(`Missing unique index: ${name}`);
  }
  for (const name of lookupIndexes) if (!byIndex.has(name)) throw new Error(`Missing lookup index: ${name}`);
  const paymentJobIndex = byIndex.get("BillingPaymentEvent_provider_verificationStatus_matchStatus_dea") ?? "";
  for (const column of ['provider', '"verificationStatus"', '"matchStatus"', '"deadLetteredAt"', '"nextAttemptAt"']) {
    if (!paymentJobIndex.includes(column)) throw new Error(`Billing inbox/job index missing column: ${column}`);
  }

  const order = await prisma.billingOrder.findFirst({ select: { id: true } });
  const payment = await prisma.billingPaymentEvent.findFirst({ select: { id: true } });
  const allocation = await prisma.paymentAllocation.findFirst({ select: { id: true } });
  if (!order || !payment || !allocation) throw new Error("Run admin:test-integration to create billing fixtures first");

  const samples: [string, (db: typeof prisma) => Promise<unknown>][] = [
    [expected[0], db => db.$executeRaw`UPDATE "BillingOrder" SET "amountDueVnd" = 0 WHERE "id" = ${order.id}`],
    [expected[1], db => db.$executeRaw`UPDATE "BillingOrder" SET "periodCountSnapshot" = 0 WHERE "id" = ${order.id}`],
    [expected[2], db => db.$executeRaw`UPDATE "BillingOrder" SET "currency" = 'USD' WHERE "id" = ${order.id}`],
    [expected[3], db => db.$executeRaw`UPDATE "BillingOrder" SET "expiresAt" = "createdAt" WHERE "id" = ${order.id}`],
    [expected[4], db => db.$executeRaw`UPDATE "BillingPaymentEvent" SET "amountVnd" = 0 WHERE "id" = ${payment.id}`],
    [expected[5], db => db.$executeRaw`UPDATE "BillingPaymentEvent" SET "direction" = 'INVALID' WHERE "id" = ${payment.id}`],
    [expected[6], db => db.$executeRaw`UPDATE "BillingPaymentEvent" SET "verificationStatus" = 'UNVERIFIED' WHERE "id" = ${payment.id}`],
    [expected[7], db => db.$executeRaw`UPDATE "BillingPaymentEvent" SET "matchStatus" = 'INVALID' WHERE "id" = ${payment.id}`],
    [expected[8], db => db.$executeRaw`UPDATE "BillingPaymentEvent" SET "attemptCount" = -1 WHERE "id" = ${payment.id}`],
    [expected[9], db => db.$executeRaw`UPDATE "BillingPaymentEvent" SET "leaseOwner" = 'owner', "leaseUntil" = NULL WHERE "id" = ${payment.id}`],
    [expected[10], db => db.$executeRaw`UPDATE "PaymentAllocation" SET "amountVnd" = 0 WHERE "id" = ${allocation.id}`],
  ];
  for (const [name, action] of samples) await rejectsWithoutWriting(name, action);
  console.log(`AD2-03 PASS: ${expected.length} CHECKs, ${foreignKeys.length} FKs, ${uniqueIndexes.length} unique and ${lookupIndexes.length} lookup indexes, ${samples.length} rejected invalid writes; fixtures unchanged`);
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
