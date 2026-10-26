/** Isolated PostgreSQL test. DATABASE_URL must point to a disposable finova_admin_test_* database. */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { INITIAL_PRICES } from "../src/modules/billing/domain";
import { seedPremiumCatalogAndLiteSubscriptions } from "../src/modules/billing/seed";
import { bootstrapPersonalWorkspace } from "../src/server/bootstrap";
import { changeUserAccess, getAdminUser, listAdminUsers } from "../src/modules/admin/users";
import { getAdminOverview } from "../src/modules/admin/overview";
import { getUsageKpis, recordAuthenticatedPageview } from "../src/modules/admin/usage";
import { listAdminPayments } from "../src/modules/admin/payments";
import { approveReceivingAccount, createBillingOrder, getBillingOrder, getPublishedPrices, listBillingOrders, listReceivingAccounts, proposeReceivingAccount, verifyBillingReceivingAccount } from "../src/modules/billing/service";
import { billingReconcileRetryDelayMs, claimPendingBillingCredit, deferFailedBillingCredit, processPendingVerifiedBillingCredits, recordVerifiedBankCredit, reconcileVerifiedBankCredit, requeueDeadLetterBillingCredit } from "../src/modules/billing/reconciliation";
import { billingOutboxRetryDelayMs, claimBillingOutbox, deadLetterExpiredBillingOutbox, deferBillingOutbox, deliverBillingOutbox, processPendingBillingNotices, requeueDeadLetterBillingNotice } from "../src/modules/billing/outbox";
import { POST as billingSePayWebhook } from "../src/app/api/webhooks/billing/sepay/route";
import { getEffectiveSubscription, requireWorkspacePremiumInDb } from "../src/server/premium";
import { proposeSubscriptionAction, decideSubscriptionAction, listSubscriptionActions } from "../src/modules/billing/manual-subscriptions";
import { assertUserActive, HttpError } from "../src/server/context";
import { resumePremiumPausedBankEvents } from "../src/modules/bank-sync/service";
import { sealBankEvent } from "../src/modules/bank-sync/domain";

function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`INTEGRATION_ASSERTION_FAILED: ${label}`);
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname;
  check(/^\/finova_admin_test_[a-zA-Z0-9_]+$/.test(database), "database must be isolated test database");
  process.env.FINOVA_ADMIN_ENABLED = "1";
  process.env.FINOVA_USER_ACCESS_ENFORCED = "1";
  process.env.FINOVA_BILLING_CHECKOUT_ENABLED = "1";
  process.env.FINOVA_BILLING_ENCRYPTION_KEY = randomBytes(32).toString("hex");

  const suffix = randomUUID().replaceAll("-", "");
  const root = `root_${suffix}`;
  const approver = `approve_${suffix}`;
  const member = `member_${suffix}`;
  const legacyUser = `legacy_${suffix}`;
  const mkUser = (id: string) => ({ id, name: id.slice(0, 16), email: `${id}@example.test`, emailVerified: true });
  await prisma.user.createMany({ data: [mkUser(root), mkUser(approver), mkUser(member), mkUser(legacyUser)] });
  await prisma.systemRoleAssignment.createMany({ data: [
    { userId: root, role: "SUPER_ADMIN" }, { userId: approver, role: "SUPER_ADMIN" },
  ] });
  // A genuine balanced ledger fixture must survive Lite backfill and subsequent Premium expiry/revocation.
  const legacyWorkspace = await bootstrapPersonalWorkspace({ id: legacyUser, name: "Legacy Finance User" });
  const legacyIncomeCategory = await prisma.category.findFirstOrThrow({
    where: { workspaceId: legacyWorkspace, kind: "INCOME" },
    select: { id: true, ledgerAccountId: true },
  });
  const legacyAssetAccount = await prisma.ledgerAccount.create({ data: {
    workspaceId: legacyWorkspace, code: `CASH_${suffix}`, name: "Legacy cash account", kind: "ASSET",
  } });
  const legacyWallet = await prisma.wallet.create({ data: {
    workspaceId: legacyWorkspace, ledgerAccountId: legacyAssetAccount.id,
    name: "Preserved wallet", type: "CASH",
  } });
  const legacyTransaction = await prisma.transaction.create({ data: {
    workspaceId: legacyWorkspace, walletId: legacyWallet.id, categoryId: legacyIncomeCategory.id,
    kind: "INCOME", amount: "120000", createdById: legacyUser, occurredAt: new Date(),
  } });
  const legacyJournal = await prisma.$transaction(async db => {
    const journal = await db.journal.create({ data: {
      workspaceId: legacyWorkspace, transactionId: legacyTransaction.id, walletId: legacyWallet.id,
      kind: "INCOME", effectiveAt: legacyTransaction.occurredAt,
    } });
    await db.posting.createMany({ data: [
      { journalId: journal.id, ledgerAccountId: legacyAssetAccount.id, side: "DEBIT", amount: "120000" },
      { journalId: journal.id, ledgerAccountId: legacyIncomeCategory.ledgerAccountId, side: "CREDIT", amount: "120000" },
    ] });
    return journal;
  });
  const financialSnapshot = async () => JSON.stringify(await Promise.all([
    prisma.wallet.findUniqueOrThrow({ where: { id: legacyWallet.id } }),
    prisma.transaction.findUniqueOrThrow({ where: { id: legacyTransaction.id } }),
    prisma.journal.findUniqueOrThrow({ where: { id: legacyJournal.id } }),
    prisma.posting.findMany({ where: { journalId: legacyJournal.id }, orderBy: { id: "asc" } }),
  ]));
  const beforeBackfill = await financialSnapshot();
  const backfill = await seedPremiumCatalogAndLiteSubscriptions();
  check(backfill.createdSubscriptions >= 3, "existing users are backfilled with Lite");
  const secondBackfill = await seedPremiumCatalogAndLiteSubscriptions();
  check(secondBackfill.createdSubscriptions === 0, "repeated Lite backfill never duplicates subscriptions");
  check((await prisma.subscription.findUniqueOrThrow({ where: { userId: member } })).planCode === "LITE",
    "legacy user receives Lite without a grant");
  check((await financialSnapshot()) === beforeBackfill, "Lite backfill leaves existing wallet, transaction and balanced journal unchanged");
  const newUser = `onboard_${suffix}`;
  await prisma.user.create({ data: mkUser(newUser) });
  await bootstrapPersonalWorkspace({ id: newUser, name: "New Lite User" });
  await bootstrapPersonalWorkspace({ id: newUser, name: "New Lite User" });
  check((await prisma.subscription.findUniqueOrThrow({ where: { userId: newUser } })).planCode === "LITE" &&
    (await prisma.workspace.count({ where: { createdById: newUser } })) === 1,
    "new user bootstrap creates one Lite subscription and one personal workspace");
  await prisma.subscriptionPlan.createMany({ data: [
    { code: "LITE", displayName: "Lite" }, { code: "PREMIUM", displayName: "Premium" },
  ], skipDuplicates: true });
  for (const price of INITIAL_PRICES) await prisma.planPrice.upsert({
    where: { productCode_version: { productCode: price.productCode, version: 1 } },
    create: { ...price, planCode: "PREMIUM", version: 1, isPublished: true, publishedAt: new Date() }, update: {},
  });
  const monthly = await prisma.planPrice.findFirstOrThrow({ where: { productCode: "PREMIUM_MONTHLY" } });
  check(Number(monthly.priceVnd) === 29000, "monthly price 29,000 VND");
  const rootActor = { userId: root, role: "SUPER_ADMIN" as const };
  const approverActor = { userId: approver, role: "SUPER_ADMIN" as const };
  const proposed = await proposeReceivingAccount(rootActor, {
    bankCode: "TEST", bankName: "Test Bank", accountName: "FINOVA TEST", accountNumber: "12345678901",
  });
  check(proposed.status === "PENDING_APPROVAL", "receiver starts pending");
  let blocked = false;
  try { await approveReceivingAccount(rootActor, proposed.id); }
  catch (e) { blocked = e instanceof Error && e.message.includes("không thể tự phê duyệt"); }
  check(blocked, "receiver cannot be self-approved");
  await approveReceivingAccount(approverActor, proposed.id);
  const accounts = await listReceivingAccounts();
  check(accounts[0].accountMasked.endsWith("8901") && !("accountNumber" in accounts[0]), "receiver masked to admin");
  const storedReceiver = await prisma.billingReceivingAccount.findUniqueOrThrow({ where: { id: proposed.id } });
  check(storedReceiver.accountNumberEncrypted !== "12345678901" &&
    !storedReceiver.accountNumberEncrypted.includes("12345678901") &&
    (await verifyBillingReceivingAccount(proposed.id, "12345678901")) &&
    !(await verifyBillingReceivingAccount(proposed.id, "99999999999")),
  "receiver AES-GCM ciphertext, masked projection, and approved receiver verification");

  const pendingBefore = await prisma.billingOrder.count({ where: { status: "PENDING_PAYMENT" } });
  const idempotencyKey = `TEST_${suffix}`;
  const orders = await Promise.all(Array.from({ length: 4 }, () => createBillingOrder(member, monthly.id, idempotencyKey)));
  check(new Set(orders.map(o => o.id)).size === 1, "parallel checkout idempotency");
  check(orders[0].amountVnd === 29000 && orders[0].bank.accountNumber === "12345678901", "order snapshot & receiver decrypt");
  check((await getBillingOrder(member, orders[0].id)).id === orders[0].id, "owner can read their order");
  check((await listBillingOrders(member)).length === 1, "only one order created");
  let forbidden = false;
  try { await getBillingOrder(root, orders[0].id); }
  catch { forbidden = true; }
  check(forbidden, "cross-user order denied");
  check((await getEffectiveSubscription(member)).plan === "LITE", "no unverified Premium activation");

  await prisma.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: member,
    expiresAt: new Date(Date.now() + 86400000) } });
  const syntheticSecret = `SYNTHETIC_SECRET_${suffix}`;
  const access = await changeUserAccess(rootActor, member, "SUSPENDED",
    `Isolated integration test suspension; token=${syntheticSecret}; account_number=12345678901`);
  check(access.status === "SUSPENDED", "status changed");
  const storedAccess = await prisma.userAccessState.findUniqueOrThrow({ where: { userId: member } });
  const accessAudit = await prisma.adminAuditLog.findFirstOrThrow({ where: { action: "USER_ACCESS_CHANGE", resourceId: member } });
  const accessEvidence = JSON.stringify([storedAccess.reason, accessAudit.reason, accessAudit.beforeJson, accessAudit.afterJson]);
  check(!accessEvidence.includes(syntheticSecret) && !accessEvidence.includes("12345678901") &&
    accessEvidence.includes("[REDACTED]"),
  "access state and persisted admin audit reason redact credentials and account number");
  check((await prisma.session.count({ where: { userId: member } })) === 0, "active sessions revoked");
  check((await prisma.adminAuditLog.count({ where: { action: "USER_ACCESS_CHANGE", resourceId: member } })) === 1, "audit appended");
  let suspendedGuardBlocked = false;
  try { await assertUserActive(member); }
  catch (error) { suspendedGuardBlocked = error instanceof HttpError && error.status === 403 && error.code === "ACCOUNT_DISABLED"; }
  check(suspendedGuardBlocked, "suspended user is rejected by the shared authenticated API guard");
  // Rolling back the Admin UI must not lift an existing suspension.
  process.env.FINOVA_ADMIN_ENABLED = "0";
  let rollbackGuardBlocked = false;
  try { await assertUserActive(member); }
  catch (error) { rollbackGuardBlocked = error instanceof HttpError && error.code === "ACCOUNT_DISABLED"; }
  check(rollbackGuardBlocked, "suspended account remains blocked when Admin is rolled back");
  process.env.FINOVA_ADMIN_ENABLED = "1";
  const deactivated = await changeUserAccess(rootActor, member, "DEACTIVATED", "Account deactivated for guarded access test");
  check(deactivated.status === "DEACTIVATED", "suspended account can be deactivated with audit");
  let deactivatedGuardBlocked = false;
  try { await assertUserActive(member); }
  catch (error) { deactivatedGuardBlocked = error instanceof HttpError && error.status === 403 && error.code === "ACCOUNT_DISABLED"; }
  check(deactivatedGuardBlocked, "deactivated user is rejected by the shared authenticated API guard");
  const suspended = await listAdminUsers({ status: "SUSPENDED" });
  check(!suspended.users.some(u => u.id === member), "deactivated user is absent from suspended-only filter");
  const detail = await getAdminUser(member);
  check(detail.plan === "LITE" && detail.accessState.status === "DEACTIVATED", "detail reflects real user status");
  const finance = await getAdminOverview("FINANCE_OPERATOR");
  check(finance.scope === "FINANCE" && !("totalUsers" in finance), "finance dashboard hides user counts");
  const all = await getAdminOverview("SUPER_ADMIN");
  check(all.scope === "OVERVIEW" && all.pendingOrders === pendingBefore + 1, "admin dashboard counts real orders");

  // Existing orders must retain the server-side snapshot if catalog rows change.
  // This isolated QA fixture restores the agreed catalog price even on test failure.
  const yearly = await prisma.planPrice.findFirstOrThrow({ where: { productCode: "PREMIUM_YEARLY" } });
  const snapshotKey = `PRICE_SNAPSHOT_${suffix}`;
  const frozenOrder = await createBillingOrder(legacyUser, monthly.id, snapshotKey);
  let checkoutConflict = false;
  try { await createBillingOrder(legacyUser, yearly.id, snapshotKey); }
  catch (error) { checkoutConflict = error instanceof HttpError && error.code === "IDEMPOTENCY_CONFLICT"; }
  check(checkoutConflict, "one idempotency key cannot switch from monthly to yearly");
  let invalidKeyRejected = false;
  try { await createBillingOrder(legacyUser, monthly.id, "short"); }
  catch (error) { invalidKeyRejected = error instanceof HttpError && error.code === "INVALID_IDEMPOTENCY_KEY"; }
  check(invalidKeyRejected, "checkout requires an acceptable idempotency key");
  for (const invalidAmount of [39000, 0]) {
    let mutationRejected = false;
    try { await prisma.planPrice.update({ where: { id: monthly.id }, data: { priceVnd: invalidAmount } }); }
    catch { mutationRejected = true; }
    check(mutationRejected, "published prices cannot be changed in place, even by direct SQL/Prisma writes");
  }
  const original = await getBillingOrder(legacyUser, frozenOrder.id);
  const replayed = await createBillingOrder(legacyUser, monthly.id, snapshotKey);
  check(original.amountVnd === 29000 && replayed.id === frozenOrder.id && replayed.amountVnd === 29000 &&
    (await getPublishedPrices()).some(price => price.id === monthly.id),
    "immutable published catalog keeps order snapshot and idempotent replay consistent");

  // Provider-verified fixture only: this test never exposes an unauthenticated payment endpoint.
  const creditFor = (order: typeof orders[number], transactionId: string, overrides: Record<string, unknown> = {}) => ({
    provider: "INTEGRATION_FIXTURE", receiverAccountId: proposed.id, providerTransactionId: transactionId,
    direction: "IN" as const, amountVnd: String(order.amountVnd), reference: `PAY ${order.orderCode}`,
    occurredAt: new Date(), ...overrides,
  });
  const wrongAmount = await recordVerifiedBankCredit(creditFor(orders[0], `under_${suffix}`, { amountVnd: "28000" }));
  const mismatch = await reconcileVerifiedBankCredit(wrongAmount.id);
  check(mismatch.status === "REVIEW_AMOUNT", "underpayment goes to review");
  check((await getEffectiveSubscription(member)).plan === "LITE", "underpayment cannot grant Premium");
  const replay = await recordVerifiedBankCredit(creditFor(orders[0], `under_${suffix}`, {
    amountVnd: "28000", occurredAt: (await prisma.billingPaymentEvent.findUniqueOrThrow({ where: { id: wrongAmount.id } })).occurredAt,
  }));
  check(replay.duplicate && replay.id === wrongAmount.id, "duplicate canonical event reused");
  let conflict = false;
  try { await recordVerifiedBankCredit(creditFor(orders[0], `under_${suffix}`)); }
  catch { conflict = true; }
  check(conflict, "same bank transaction ID with conflicting data rejected");

  const foreignReceiver = await recordVerifiedBankCredit(creditFor(orders[0], `foreign_${suffix}`, { receiverAccountId: `foreign_${suffix}` }));
  check((await reconcileVerifiedBankCredit(foreignReceiver.id)).status === "REVIEW_RECEIVER", "receiver mismatch does not grant");
  const outbound = await recordVerifiedBankCredit(creditFor(orders[0], `out_${suffix}`, { direction: "OUT" }));
  check((await reconcileVerifiedBankCredit(outbound.id)).status === "REVIEW_DIRECTION", "outgoing funds cannot grant");
  const unknown = await recordVerifiedBankCredit(creditFor(orders[0], `unknown_${suffix}`, { reference: "UNKNOWN PAYMENT" }));
  check((await reconcileVerifiedBankCredit(unknown.id)).status === "UNMATCHED", "unknown reference cannot grant");
  const late = await recordVerifiedBankCredit(creditFor(orders[0], `late_${suffix}`, {
    occurredAt: new Date(orders[0].expiresAt.getTime() + 1000),
  }));
  check((await reconcileVerifiedBankCredit(late.id)).status === "LATE_PAYMENT_REVIEW", "late payment held for review");
  const verified = await recordVerifiedBankCredit(creditFor(orders[0], `paid_${suffix}`));
  const sameEvent = await Promise.all(Array.from({ length: 3 }, () => reconcileVerifiedBankCredit(verified.id)));
  check(sameEvent.some(r => r.status === "MATCHED"), "verified matching succeeds");
  check((await prisma.paymentAllocation.count({ where: { orderId: orders[0].id } })) === 1, "only one allocation per order");
  check((await prisma.subscriptionGrant.count({ where: { orderId: orders[0].id } })) === 1, "only one grant per order");
  check((await prisma.subscriptionEvent.count({ where: { orderId: orders[0].id, kind: "GRANT_ACTIVATED" } })) === 1,
    "payment grant has one append-only activation event");
  check((await prisma.billingOutbox.count({ where: { orderId: orders[0].id } })) === 1,
    "payment grant and durable billing notice outbox commit atomically");
  check((await getEffectiveSubscription(member)).plan === "PREMIUM", "verified payment activates Premium");

  const renewalA = await createBillingOrder(member, monthly.id, `RENEW_A_${suffix}`);
  const renewalB = await createBillingOrder(member, monthly.id, `RENEW_B_${suffix}`);
  const [eventA, eventB] = await Promise.all([
    recordVerifiedBankCredit(creditFor(renewalA, `renew_a_${suffix}`)),
    recordVerifiedBankCredit(creditFor(renewalB, `renew_b_${suffix}`)),
  ]);
  const renewals = await Promise.all([reconcileVerifiedBankCredit(eventA.id), reconcileVerifiedBankCredit(eventB.id)]);
  check(renewals.every(r => r.status === "MATCHED"), "concurrent distinct orders both grant");
  const grants = await prisma.subscriptionGrant.findMany({ where: { userId: member }, orderBy: { startsAt: "asc" } });
  check(grants.length === 3, "three independent paid orders yield three grants");
  check((await prisma.subscriptionEvent.count({ where: { userId: member, kind: "GRANT_ACTIVATED" } })) === 3,
    "concurrent renewal creates exactly one history event per order");
  const notificationOutbox = await prisma.billingOutbox.findFirstOrThrow({ where: { orderId: orders[0].id } });
  const [firstNoticeLease, secondNoticeLease] = await Promise.all([
    claimBillingOutbox(notificationOutbox.id), claimBillingOutbox(notificationOutbox.id),
  ]);
  check(Number(Boolean(firstNoticeLease)) + Number(Boolean(secondNoticeLease)) === 1,
    "two notice dispatchers cannot claim one outbox entry");
  const staleNoticeLease = firstNoticeLease ?? secondNoticeLease!;
  let outboxClock = new Date(Date.now() + 2 * 60_000 + 2000);
  let noticeLease = (await claimBillingOutbox(notificationOutbox.id, outboxClock))!;
  check(Boolean(noticeLease) && noticeLease !== staleNoticeLease, "expired notification lease is recoverable");
  check((await deliverBillingOutbox(notificationOutbox.id, staleNoticeLease, outboxClock)) === "LOST_LEASE",
    "stale worker cannot deliver after lease takeover");
  check((await deferBillingOutbox(notificationOutbox.id, staleNoticeLease, outboxClock)) === "LOST_LEASE",
    "stale worker cannot defer a successor's lease");
  check((await prisma.billingNotice.count({ where: { orderId: orders[0].id } })) === 0,
    "expired worker did not insert a customer notice");
  for (let attempt = 2; attempt <= 6; attempt++) {
    check((await deferBillingOutbox(notificationOutbox.id, noticeLease, outboxClock)) ===
      (attempt === 6 ? "DEAD_LETTER" : "RETRY"), "notification retry and DLQ bound");
    check((await claimBillingOutbox(notificationOutbox.id, outboxClock)) === null,
      "notification backoff prevents immediate retry");
    outboxClock = new Date(outboxClock.getTime() + billingOutboxRetryDelayMs(attempt) + 1);
    if (attempt < 6) {
      noticeLease = (await claimBillingOutbox(notificationOutbox.id, outboxClock))!;
      check(Boolean(noticeLease), "notice eligible for retry after backoff");
    }
  }
  check(Boolean((await prisma.billingOutbox.findUniqueOrThrow({ where: { id: notificationOutbox.id } })).deadLetteredAt),
    "outbox DLQ retains undelivered event for inspection");
  check((await requeueDeadLetterBillingNotice(rootActor, notificationOutbox.id,
    "Investigated notification worker failure, safe to retry")).status === "QUEUED", "audited notice replay");
  check((await prisma.adminAuditLog.count({ where: { action: "BILLING_NOTICE_REQUEUE", resourceId: notificationOutbox.id } })) === 1,
    "notice replay retains operator audit");
  const deliveryLease = (await claimBillingOutbox(notificationOutbox.id))!;
  check(Boolean(deliveryLease), "replayed notification can be claimed");
  const competingDeliveries = await Promise.all([
    deliverBillingOutbox(notificationOutbox.id, deliveryLease),
    deliverBillingOutbox(notificationOutbox.id, deliveryLease),
  ]);
  check(competingDeliveries.filter(result => result === "DELIVERED").length === 1 &&
    competingDeliveries.filter(result => result === "LOST_LEASE").length === 1,
  "concurrent deliveries produce exactly one durable customer notice");
  const dispatches = await Promise.all([processPendingBillingNotices(), processPendingBillingNotices()]);
  check(dispatches.reduce((sum, result) => sum + result.delivered, 0) === 2,
    "concurrent dispatchers deliver exactly one notice for each paid order");
  check((await prisma.billingNotice.count({ where: { userId: member } })) === 3,
    "one durable customer-facing billing notice per grant");
  check((await prisma.billingOutbox.count({ where: { userId: member, status: "DELIVERED" } })) === 3,
    "all customer notices acknowledged as delivered");
  check((await processPendingBillingNotices()).delivered === 0, "notification worker replay is idempotent");
  const crashOrder = await createBillingOrder(member, monthly.id, `LEASE_CRASH_${suffix}`);
  const crashPayment = await recordVerifiedBankCredit(creditFor(crashOrder, `lease_crash_${suffix}`));
  check((await reconcileVerifiedBankCredit(crashPayment.id)).status === "MATCHED",
    "exhausted-lease recovery fixture has a verified grant");
  const crashedOutbox = await prisma.billingOutbox.findUniqueOrThrow({ where: { orderId: crashOrder.id } });
  await prisma.billingOutbox.update({ where: { id: crashedOutbox.id }, data: {
    attemptCount: 6, leaseOwner: "crashed-notice-worker",
    leaseUntil: new Date(Date.now() - 1000),
  } });
  const recoveredDeadLetter = await processPendingBillingNotices();
  check(recoveredDeadLetter.deadLettered === 1 && recoveredDeadLetter.delivered === 0,
    "worker recovers exhausted lease into DLQ without exceeding retry budget");
  check((await claimBillingOutbox(crashedOutbox.id)) === null, "exhausted entry cannot be re-claimed");
  const failedNotification = await prisma.billingOutbox.findUniqueOrThrow({ where: { id: crashedOutbox.id } });
  check(failedNotification.attemptCount === 6 && failedNotification.lastErrorCode === "NOTICE_LEASE_EXHAUSTED" &&
    Boolean(failedNotification.deadLetteredAt), "worker crash is inspectable in DLQ");
  check((await deadLetterExpiredBillingOutbox()) === 0, "DLQ sweep is idempotent");
  check((await requeueDeadLetterBillingNotice(rootActor, crashedOutbox.id,
    "Reviewed expired worker lease and approved safe delivery replay")).status === "QUEUED",
    "operator can replay exhausted notice after audit");
  check((await processPendingBillingNotices()).delivered === 1 &&
    (await prisma.billingNotice.count({ where: { orderId: crashOrder.id } })) === 1,
    "recovered worker delivers one notice without granting Premium again");
  check((await prisma.subscriptionGrant.count({ where: { orderId: crashOrder.id } })) === 1,
    "notification recovery cannot duplicate subscription grant");
  check((await prisma.subscriptionEvent.count({ where: { orderId: crashOrder.id } })) === 1,
    "notification recovery cannot duplicate subscription history");

  // Fault injection on the isolated PostgreSQL database: failure after allocation
  // and grant insert must roll back the entire activation, then permit a safe retry.
  const rollbackOrder = await createBillingOrder(member, monthly.id, `ROLLBACK_${suffix}`);
  const rollbackCredit = await recordVerifiedBankCredit(creditFor(rollbackOrder, `rollback_${suffix}`));
  const priorGrants = await prisma.subscriptionGrant.count({ where: { userId: member } });
  const priorSubscription = await prisma.subscription.findUniqueOrThrow({ where: { userId: member } });
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS finova_test_activation_rollback ON "SubscriptionEvent"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS finova_test_activation_failure()');
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION finova_test_activation_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'SIMULATED_SUBSCRIPTION_EVENT_FAILURE';
    END; $$`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER finova_test_activation_rollback BEFORE INSERT ON "SubscriptionEvent"
    FOR EACH ROW EXECUTE FUNCTION finova_test_activation_failure()`);
  let rolledBack = false;
  try {
    try { await reconcileVerifiedBankCredit(rollbackCredit.id); }
    catch { rolledBack = true; }
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS finova_test_activation_rollback ON "SubscriptionEvent"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS finova_test_activation_failure()');
  }
  check(rolledBack, "injected activation write failure reached the transaction boundary");
  check((await prisma.billingOrder.findUniqueOrThrow({ where: { id: rollbackOrder.id } })).status === "PENDING_PAYMENT",
    "failed activation did not mark order paid");
  check((await prisma.billingPaymentEvent.findUniqueOrThrow({ where: { id: rollbackCredit.id } })).matchStatus === "RECEIVED",
    "verified credit remains durable and retryable after atomic rollback");
  check((await prisma.paymentAllocation.count({ where: { orderId: rollbackOrder.id } })) === 0 &&
    (await prisma.subscriptionGrant.count({ where: { orderId: rollbackOrder.id } })) === 0 &&
    (await prisma.subscriptionEvent.count({ where: { orderId: rollbackOrder.id } })) === 0 &&
    (await prisma.billingOutbox.count({ where: { orderId: rollbackOrder.id } })) === 0,
    "failed activation rolled back allocation, grant, event and outbox");
  check((await prisma.subscriptionGrant.count({ where: { userId: member } })) === priorGrants &&
    (await prisma.subscription.findUniqueOrThrow({ where: { userId: member } })).expiresAt?.getTime() === priorSubscription.expiresAt?.getTime(),
    "failed activation preserved existing subscription state");
  check((await reconcileVerifiedBankCredit(rollbackCredit.id)).status === "MATCHED",
    "verified credit can be retried successfully after transient transaction failure");
  check((await prisma.subscriptionGrant.count({ where: { orderId: rollbackOrder.id } })) === 1 &&
    (await prisma.subscriptionEvent.count({ where: { orderId: rollbackOrder.id } })) === 1 &&
    (await prisma.billingOutbox.count({ where: { orderId: rollbackOrder.id } })) === 1,
    "recovered activation commits exactly one grant, event and durable outbox");
  check((await processPendingBillingNotices()).delivered === 1,
    "recovered activation notice is delivered exactly once");
  check(grants[0].expiresAt.getTime() === grants[1].startsAt.getTime() &&
    grants[1].expiresAt.getTime() === grants[2].startsAt.getTime(), "concurrent renewal periods contiguous");
  check((await prisma.adminAuditLog.count({ where: { action: "PREMIUM_PAYMENT_MATCHED", resourceId: orders[0].id } })) === 1,
    "match writes exactly one audit record");
  const review = await listAdminPayments({ reviewOnly: true });
  check(review.total >= 5, "admin finance report retains review cases");
  check(review.events.every(e => !("reference" in e) && !("providerAccountRef" in e) &&
    !("providerTransactionId" in e)), "finance events redact unneeded bank details");

  // Signed synthetic SePay webhook: proves authenticated ingress + durable ACK, not bank-provider UAT.
  const merchantOrder = await createBillingOrder(member, monthly.id, `SEPAY_${suffix}`);
  process.env.FINOVA_BILLING_SEPAY_WEBHOOK_ENABLED = "1";
  process.env.FINOVA_BILLING_SEPAY_WEBHOOK_SECRET = randomBytes(40).toString("hex");
  process.env.FINOVA_BILLING_SEPAY_RECEIVER_ID = proposed.id;
  const localTime = new Date(Date.now() + 2000 + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const sepayBody = Buffer.from(JSON.stringify({ id: String(Date.now()), gateway: "Test Bank",
    transactionDate: localTime, accountNumber: "12345678901", content: `TRANSFER ${merchantOrder.orderCode}`,
    transferType: "in", transferAmount: 29000 }));
  const signedRequest = (bytes: Buffer, signatureFor = bytes) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", process.env.FINOVA_BILLING_SEPAY_WEBHOOK_SECRET!)
      .update(timestamp).update(".").update(signatureFor).digest("hex");
    return new NextRequest("https://finova.test/api/webhooks/billing/sepay", { method: "POST", body: bytes.toString("utf8"),
      headers: { "Content-Type": "application/json", "X-SePay-Timestamp": timestamp,
        "X-SePay-Signature": `sha256=${signature}` } });
  };
  const tampered = await billingSePayWebhook(signedRequest(sepayBody, Buffer.from("wrong")));
  check(tampered.status === 401, "modified signed webhook rejected");
  const wrongBank = Buffer.from(JSON.stringify({ ...JSON.parse(sepayBody.toString()), accountNumber: "99999999999" }));
  const wrongReceiverResponse = await billingSePayWebhook(signedRequest(wrongBank));
  check(wrongReceiverResponse.status === 403, "signed event for unapproved receiving account rejected");
  const accepted = await billingSePayWebhook(signedRequest(sepayBody));
  check(accepted.status === 200 && (await accepted.json()).success === true, "signed webhook ACK after durable insert");
  const receipt = await prisma.billingPaymentEvent.findFirstOrThrow({ where: {
    provider: "SEPAY_BILLING", reference: `TRANSFER ${merchantOrder.orderCode}`,
  } });
  check(receipt.matchStatus === "RECEIVED" && receipt.verificationStatus === "VERIFIED", "inbox persisted before ACK");
  const repeated = await billingSePayWebhook(signedRequest(sepayBody));
  check(repeated.status === 200, "signed SePay event retry acknowledged without duplication");
  check((await prisma.billingPaymentEvent.count({ where: { provider: "SEPAY_BILLING", providerTransactionId: receipt.providerTransactionId } })) === 1,
    "SePay event unique under webhook replay");
  const workerResults = await Promise.all([processPendingVerifiedBillingCredits(), processPendingVerifiedBillingCredits()]);
  check(workerResults.reduce((sum, r) => sum + r.matched, 0) === 1, "two workers match the bank payment only once");
  check((await prisma.billingOrder.findUniqueOrThrow({ where: { id: merchantOrder.id } })).status === "PAID",
    "authenticated SePay receipt activates Premium through worker");
  check((await prisma.paymentAllocation.count({ where: { orderId: merchantOrder.id } })) === 1,
    "concurrent billing workers create a single allocation");
  const bankNotices = await Promise.all([processPendingBillingNotices(), processPendingBillingNotices()]);
  check(bankNotices.reduce((sum, result) => sum + result.delivered, 0) === 1 &&
    (await prisma.billingNotice.count({ where: { orderId: merchantOrder.id } })) === 1,
  "bank worker emits exactly one durable in-app activation notice");

  // Simulate a repeatedly failing processor without altering production billing data.
  const poison = await recordVerifiedBankCredit({ ...creditFor(merchantOrder, `poison_${suffix}`),
    provider: "SEPAY_BILLING", reference: "NO ORDER REFERENCE" });
  let testClock = new Date();
  const [firstLease, secondLease] = await Promise.all([
    claimPendingBillingCredit(poison.id, testClock), claimPendingBillingCredit(poison.id, testClock),
  ]);
  check(Number(Boolean(firstLease)) + Number(Boolean(secondLease)) === 1, "atomic lease allows one worker");
  let lease = firstLease ?? secondLease!;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const result = await deferFailedBillingCredit(poison.id, lease, testClock);
    check(result === (attempt === 6 ? "DEAD_LETTER" : "RETRY"), "bounded retry transitions");
    check((await claimPendingBillingCredit(poison.id, testClock)) === null, "backoff blocks immediate retry");
    testClock = new Date(testClock.getTime() + billingReconcileRetryDelayMs(attempt) + 1);
    if (attempt < 6) {
      lease = (await claimPendingBillingCredit(poison.id, testClock))!;
      check(Boolean(lease), "eligible retry is reclaimable");
    }
  }
  const dead = await prisma.billingPaymentEvent.findUniqueOrThrow({ where: { id: poison.id } });
  check(Boolean(dead.deadLetteredAt) && dead.attemptCount === 6 && dead.lastErrorCode === "RECONCILIATION_FAILED",
    "poison message lands in durable dead letter queue without storing exception text");
  const reopened = await requeueDeadLetterBillingCredit(rootActor, poison.id, "Investigated test processor error, safe to replay");
  check(reopened.status === "QUEUED", "privileged operator can requeue verified dead-letter message");
  check((await prisma.adminAuditLog.count({ where: { action: "BILLING_RECONCILIATION_REQUEUE", resourceId: poison.id } })) === 1,
    "requeue has audit record");
  await processPendingVerifiedBillingCredits();
  check((await prisma.billingPaymentEvent.findUniqueOrThrow({ where: { id: poison.id } })).matchStatus === "UNMATCHED",
    "requeued event goes through normal matcher, never grants an unrelated subscription");
  process.env.FINOVA_USAGE_ANALYTICS_ENABLED = "1";
  const navigationId = randomUUID();
  const usageResults = await Promise.all(Array.from({ length: 3 }, () =>
    recordAuthenticatedPageview(member, navigationId, "DASHBOARD")));
  check(usageResults.filter(result => result.counted).length === 1, "navigation replay counted once");
  await recordAuthenticatedPageview(member, randomUUID(), "REPORTS");
  const todayVn = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const usageRows = await prisma.productUsageDaily.findMany({ where: { userId: member } });
  check(usageRows.length === 1 && usageRows[0].pageViews === 2 &&
    usageRows[0].dayVn.toISOString().slice(0, 10) === todayVn, "daily rollup is atomic on Vietnam day");
  const usageKpis = await getUsageKpis();
  check(usageKpis.dau >= 1 && usageKpis.wau >= 1 && usageKpis.mau >= 1 && usageKpis.pageViews30d >= 2,
    "admin metrics count real signed-user activity");
  check(usageKpis.trends.length === 90 && usageKpis.days.length === 7 &&
    usageKpis.trends.at(-1)?.day === todayVn && usageKpis.pageViews90d >= usageKpis.pageViews30d &&
    usageKpis.pageViews30d >= usageKpis.pageViews7d,
    "7/30/90-day usage windows are ordered and include the current Vietnam day");
  const fortyFiveDaysAgo = new Date(usageKpis.trends[44].day + "T12:00:00Z");
  await recordAuthenticatedPageview(member, randomUUID(), "REPORTS", fortyFiveDaysAgo);
  const extendedUsageKpis = await getUsageKpis();
  check(extendedUsageKpis.pageViews90d >= usageKpis.pageViews90d + 1 &&
    extendedUsageKpis.pageViews30d === usageKpis.pageViews30d &&
    extendedUsageKpis.trends[44].pageViews >= 1,
    "a pageview 45 days ago contributes to the 90-day series but not 30-day totals");
  const measuredOverview = await getAdminOverview("ADMIN");
  check(measuredOverview.scope === "OVERVIEW" && measuredOverview.traffic.status === "ACTIVE",
    "admin dashboard reports real activity when explicitly enabled");
  // Manual Premium is a non-cash, two-person workflow. No client receipt can grant it.
  const manualUser = legacyUser;
  // Exercise the opt-in rollout policy explicitly; ordinary integration tests
  // keep the premium paywall disabled unless this flag is set.
  const oldEntitlementFlag = process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED;
  process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "1";
  // Test all paid utilities against the actual PostgreSQL grant state. A
  // worker must fail before the transaction can write, even if its API guard
  // was passed before Premium expired or was revoked.
  const utilityFeatures = ["STATEMENT_IMPORT", "BANK_SYNC", "NOTIFICATIONS"] as const;
  const expectUtilityAccess = async (expected: "ALLOW" | "DENY", at = new Date()) => {
    for (const feature of utilityFeatures) {
      let result: "ALLOW" | "DENY" = "ALLOW";
      try {
        await prisma.$transaction(db => requireWorkspacePremiumInDb(db, legacyWorkspace, feature, at));
      } catch (error) {
        if (!(error instanceof HttpError) || error.code !== "PREMIUM_REQUIRED") throw error;
        result = "DENY";
      }
      check(result === expected, feature + " must be " + expected + " at the write boundary");
    }
  };
  await expectUtilityAccess("DENY");
  // A durable Bank Sync event paused for Lite must survive until the owner
  // upgrades, then re-enter the queue exactly once (without a new bank event).
  await prisma.bankProvider.upsert({ where: { code: "SANDBOX" },
    create: { code: "SANDBOX", displayName: "Isolated bank-sync fixture", status: "SANDBOX", capabilitiesJson: {} },
    update: {} });
  const pausedConnection = await prisma.bankConnection.create({ data: {
    workspaceId: legacyWorkspace, providerCode: "SANDBOX", status: "ACTIVE", postingPolicy: "REVIEW_FIRST",
  } });
  const pausedConsent = await prisma.bankConsent.create({ data: {
    workspaceId: legacyWorkspace, connectionId: pausedConnection.id,
    scopeJson: { transactions: true, simulated: true }, purposeVersion: "fixture-v1",
    evidenceRef: `fixture:${suffix}`, grantedAt: new Date(),
  } });
  const pausedAccount = await prisma.bankAccount.create({ data: {
    workspaceId: legacyWorkspace, connectionId: pausedConnection.id,
    providerAccountRef: `fixture-${suffix}`, accountMasked: "•••• TEST", currency: "VND",
  } });
  const encryptedBankFixture = (eventId: string, accountRef: string) => sealBankEvent(Buffer.from(JSON.stringify({
    eventId, accountRef, transactions: [{ externalTransactionId: eventId, amount: "12500", direction: "IN",
      currency: "VND", occurredAt: "2026-10-22T10:00:00+07:00", bookedAt: "2026-10-22T10:00:00+07:00",
      bookingStatus: "BOOKED", descriptionRaw: "Synthetic paused event", sourceVersion: "1" }],
  })));
  const pausedEvent = await prisma.bankRawEvent.create({ data: {
    workspaceId: legacyWorkspace, connectionId: pausedConnection.id, providerCode: "SANDBOX",
    externalEventId: `paused_${suffix}`,
    payloadCiphertext: encryptedBankFixture(`paused_${suffix}`, pausedAccount.providerAccountRef),
    payloadHash: randomBytes(32).toString("hex"), signatureValid: true, processingStatus: "PAUSED",
    lastError: "PREMIUM_REQUIRED",
  } });
  const pausedJob = await prisma.bankSyncOutbox.create({ data: {
    eventType: "BANK_EVENT", aggregateId: pausedEvent.id, status: "PAUSED",
  } });
  const unrelatedPause = await prisma.bankRawEvent.create({ data: {
    workspaceId: legacyWorkspace, connectionId: pausedConnection.id, providerCode: "SANDBOX",
    externalEventId: `manual_pause_${suffix}`,
    payloadCiphertext: encryptedBankFixture(`manual_pause_${suffix}`, pausedAccount.providerAccountRef),
    payloadHash: randomBytes(32).toString("hex"), signatureValid: true, processingStatus: "PAUSED",
    lastError: "CONNECTION_INACTIVE",
  } });
  const unrelatedJob = await prisma.bankSyncOutbox.create({ data: {
    eventType: "BANK_EVENT", aggregateId: unrelatedPause.id, status: "PAUSED",
  } });
  check((await resumePremiumPausedBankEvents()) === 0 &&
    (await prisma.bankSyncOutbox.findUniqueOrThrow({ where: { id: pausedJob.id } })).status === "PAUSED",
    "Lite retains paused bank events without prematurely restarting them");
  process.env.FINOVA_ADMIN_ENABLED = "0";
  check((await resumePremiumPausedBankEvents()) === 0,
    "disabled Admin with entitlement flag on does not activate premium resume workflow");
  process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "0";
  check((await resumePremiumPausedBankEvents()) === 0,
    "disabled Admin with entitlement flag off preserves legacy queue behavior");
  process.env.FINOVA_ADMIN_ENABLED = "1";
  // An opt-out rollout must resume previously entitlement-paused jobs for an
  // active user, but it must never resume work for a suspended account.
  process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "0";
  check((await resumePremiumPausedBankEvents()) === 1 &&
    (await prisma.bankSyncOutbox.findUniqueOrThrow({ where: { id: unrelatedJob.id } })).status === "PAUSED",
    "disabled paywall resumes only entitlement-paused work for active accounts");
  await prisma.bankSyncOutbox.update({ where: { id: pausedJob.id }, data: { status: "PAUSED" } });
  await prisma.bankRawEvent.update({ where: { id: pausedEvent.id }, data: {
    processingStatus: "PAUSED", lastError: "PREMIUM_REQUIRED",
  } });
  process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "1";
  const cashBefore = await prisma.paymentAllocation.count();
  const manualRequest = await proposeSubscriptionAction(rootActor, {
    userId: manualUser, kind: "MANUAL_GRANT", period: "MONTH",
    reason: `One-month service recovery compensation; {"api_key":"${syntheticSecret}"}`,
    idempotencyKey: `grant_${suffix}`,
  });
  const persistedRequest = await prisma.subscriptionActionRequest.findUniqueOrThrow({ where: { id: manualRequest.id } });
  const persistedProposalAudit = await prisma.adminAuditLog.findFirstOrThrow({ where: {
    resourceType: "SUBSCRIPTION_ACTION", resourceId: manualRequest.id, action: "SUBSCRIPTION_ACTION_PROPOSED",
  } });
  check(!JSON.stringify([persistedRequest.reason, persistedProposalAudit]).includes(syntheticSecret),
    "manual subscription request and audit never persist operator supplied API key");
  check(manualRequest.status === "PENDING" && (await getEffectiveSubscription(manualUser)).plan === "LITE",
    "proposing free Premium never activates it");
  const repeatedProposal = await proposeSubscriptionAction(rootActor, {
    userId: manualUser, kind: "MANUAL_GRANT", period: "MONTH",
    reason: `One-month service recovery compensation; {"api_key":"${syntheticSecret}"}`,
    idempotencyKey: `grant_${suffix}`,
  });
  check(repeatedProposal.id === manualRequest.id, "manual proposal idempotency");
  let rejectedSelfApproval = false;
  try { await decideSubscriptionAction(rootActor, manualRequest.id, "APPROVE", "Independent review completed"); }
  catch { rejectedSelfApproval = true; }
  check(rejectedSelfApproval, "manual grant cannot be self-approved");
  const manualDecisions = await Promise.all(Array.from({ length: 2 }, () =>
    decideSubscriptionAction(approverActor, manualRequest.id, "APPROVE", "Independent review completed")));
  check(manualDecisions.every(d => d.status === "APPROVED"), "approval retries are idempotent");
  const granted = await prisma.subscriptionGrant.findMany({ where: { userId: manualUser, grantType: "MANUAL" } });
  check(granted.length === 1 && granted[0].orderId === null &&
    (await getEffectiveSubscription(manualUser)).plan === "PREMIUM" &&
    (await prisma.subscriptionEvent.count({ where: { userId: manualUser, kind: "MANUAL_ACTIVATED" } })) === 1,
    "manual approval atomically creates one non-cash grant and history event");
  await expectUtilityAccess("ALLOW");
  await expectUtilityAccess("DENY", granted[0].expiresAt);
  const concurrentResumes = await Promise.all([resumePremiumPausedBankEvents(), resumePremiumPausedBankEvents()]);
  check(concurrentResumes.reduce((sum, count) => sum + count, 0) === 1 &&
    (await resumePremiumPausedBankEvents()) === 0 &&
    (await prisma.bankSyncOutbox.findUniqueOrThrow({ where: { id: pausedJob.id } })).status === "PENDING" &&
    (await prisma.bankSyncOutbox.findUniqueOrThrow({ where: { id: unrelatedJob.id } })).status === "PAUSED" &&
    (await prisma.bankRawEvent.findUniqueOrThrow({ where: { id: pausedEvent.id } })).processingStatus === "PENDING",
    "upgraded Premium owner resumes only entitlement-paused bank events exactly once");
  await prisma.bankSyncOutbox.update({ where: { id: pausedJob.id }, data: { status: "PAUSED" } });
  await prisma.bankRawEvent.update({ where: { id: pausedEvent.id }, data: {
    processingStatus: "PAUSED", lastError: "PREMIUM_REQUIRED",
  } });
  await prisma.bankConsent.update({ where: { id: pausedConsent.id }, data: { expiresAt: new Date(0) } });
  check((await resumePremiumPausedBankEvents()) === 0,
    "renewed Premium does not revive events whose bank consent expired");
  await prisma.bankConsent.update({ where: { id: pausedConsent.id }, data: { expiresAt: null } });
  await prisma.bankConnection.update({ where: { id: pausedConnection.id }, data: { status: "PAUSED" } });
  check((await resumePremiumPausedBankEvents()) === 0,
    "renewed Premium does not revive events on paused connections");
  await prisma.bankConnection.update({ where: { id: pausedConnection.id }, data: { status: "ACTIVE" } });
  await changeUserAccess(rootActor, manualUser, "SUSPENDED", "Suspend Premium owner during bank job test");
  let suspendedWorkerBlocked = false;
  try { await prisma.$transaction(db => requireWorkspacePremiumInDb(db, legacyWorkspace, "BANK_SYNC")); }
  catch (error) { suspendedWorkerBlocked = error instanceof HttpError && error.code === "ACCOUNT_DISABLED"; }
  check(suspendedWorkerBlocked && (await resumePremiumPausedBankEvents()) === 0,
    "suspended Premium account cannot restart a background bank write");
  process.env.FINOVA_ADMIN_ENABLED = "0";
  let rollbackWorkerBlocked = false;
  try { await prisma.$transaction(db => requireWorkspacePremiumInDb(db, legacyWorkspace, "BANK_SYNC")); }
  catch (error) { rollbackWorkerBlocked = error instanceof HttpError && error.code === "ACCOUNT_DISABLED"; }
  check(rollbackWorkerBlocked, "background bank writes remain blocked when Admin UI is disabled");
  process.env.FINOVA_ADMIN_ENABLED = "1";
  process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "0";
  check((await resumePremiumPausedBankEvents()) === 0,
    "disabling paywall cannot resume bank jobs while the user is suspended");
  process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "1";
  await changeUserAccess(rootActor, manualUser, "ACTIVE", "Restore Premium owner for paused event recovery");
  check((await resumePremiumPausedBankEvents()) === 1,
    "reactivation safely resumes paused work when Premium is still effective");
  // Consent on account A must not revive a paused event originally received
  // from account B on the same SePay connection.
  await prisma.bankProvider.upsert({ where: { code: "SEPAY_BANKHUB" },
    create: { code: "SEPAY_BANKHUB", displayName: "Synthetic SePay fixture", status: "SANDBOX", capabilitiesJson: {} },
    update: {} });
  const scopedConnection = await prisma.bankConnection.create({ data: {
    workspaceId: legacyWorkspace, providerCode: "SEPAY_BANKHUB", status: "ACTIVE", postingPolicy: "REVIEW_FIRST",
  } });
  const scopedAccountA = await prisma.bankAccount.create({ data: {
    workspaceId: legacyWorkspace, connectionId: scopedConnection.id,
    providerAccountRef: `scoped-a-${suffix}`, accountMasked: "•••• A", currency: "VND",
  } });
  const scopedAccountB = await prisma.bankAccount.create({ data: {
    workspaceId: legacyWorkspace, connectionId: scopedConnection.id,
    providerAccountRef: `scoped-b-${suffix}`, accountMasked: "•••• B", currency: "VND",
  } });
  const scopedConsent = await prisma.bankConsent.create({ data: {
    workspaceId: legacyWorkspace, connectionId: scopedConnection.id,
    scopeJson: { transactions: true, bankAccountXid: scopedAccountA.providerAccountRef },
    purposeVersion: "synthetic-only", evidenceRef: `scoped:${suffix}`, grantedAt: new Date(),
  } });
  const scopedPausedJobs = [];
  for (const account of [scopedAccountA, scopedAccountB]) {
    const externalEventId = `scoped_${account.id}_${suffix}`;
    const event = await prisma.bankRawEvent.create({ data: {
      workspaceId: legacyWorkspace, connectionId: scopedConnection.id, providerCode: "SEPAY_BANKHUB",
      externalEventId, payloadCiphertext: encryptedBankFixture(externalEventId, account.providerAccountRef),
      payloadHash: randomBytes(32).toString("hex"), signatureValid: true,
      processingStatus: "PAUSED", lastError: "PREMIUM_REQUIRED",
    } });
    const job = await prisma.bankSyncOutbox.create({ data: {
      eventType: "BANK_EVENT", aggregateId: event.id, status: "PAUSED",
    } });
    scopedPausedJobs.push({ event, job });
  }
  // More than ten early, consent-invalid events used to exhaust the fixed
  // limit=1 scan. Keep their timestamps at PostgreSQL microsecond precision to
  // prove that the cursor does not round back and re-read the same first page.
  const invalidEarlyJobs: { eventId: string; jobId: string }[] = [];
  for (let index = 0; index < 22; index++) {
    const externalEventId = `uncosented_${index}_${suffix}`;
    const event = await prisma.bankRawEvent.create({ data: {
      workspaceId: legacyWorkspace, connectionId: scopedConnection.id, providerCode: "SEPAY_BANKHUB",
      externalEventId, payloadCiphertext: encryptedBankFixture(externalEventId, scopedAccountB.providerAccountRef),
      payloadHash: randomBytes(32).toString("hex"), signatureValid: true,
      processingStatus: "PAUSED", lastError: "PREMIUM_REQUIRED",
    } });
    const job = await prisma.bankSyncOutbox.create({ data: {
      eventType: "BANK_EVENT", aggregateId: event.id, status: "PAUSED",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    } });
    invalidEarlyJobs.push({ eventId: event.id, jobId: job.id });
  }
  const preciseTimestampCount = await prisma.$executeRaw`
    UPDATE bank_sync_outbox
    SET "createdAt" = TIMESTAMPTZ '2025-01-01 00:00:00.000001+00'
    WHERE "aggregateId" IN (
      SELECT "id" FROM bank_raw_events
      WHERE "connectionId" = ${scopedConnection.id}
        AND "externalEventId" LIKE ${`uncosented_%_${suffix}`}
    )
  `;
  check(preciseTimestampCount === invalidEarlyJobs.length, "microsecond cursor fixture updated every invalid job");
  check((await resumePremiumPausedBankEvents(1)) === 1 &&
    (await prisma.bankSyncOutbox.findUniqueOrThrow({ where: { id: scopedPausedJobs[0].job.id } })).status === "PENDING" &&
    (await prisma.bankSyncOutbox.findUniqueOrThrow({ where: { id: scopedPausedJobs[1].job.id } })).status === "PAUSED",
    "keyset scanning skips earlier consent-invalid events and resumes only the consented SePay account");
  check((await prisma.bankSyncOutbox.count({ where: {
    id: { in: invalidEarlyJobs.map(job => job.jobId) }, status: "PAUSED",
  } })) === invalidEarlyJobs.length, "invalid early events remain paused after scanning");
  await prisma.bankSyncOutbox.deleteMany({ where: { id: { in: invalidEarlyJobs.map(job => job.jobId) } } });
  await prisma.bankRawEvent.deleteMany({ where: { id: { in: invalidEarlyJobs.map(job => job.eventId) } } });
  for (const { event, job } of scopedPausedJobs) {
    await prisma.bankSyncOutbox.delete({ where: { id: job.id } });
    await prisma.bankRawEvent.delete({ where: { id: event.id } });
  }
  await prisma.bankConsent.delete({ where: { id: scopedConsent.id } });
  await prisma.bankAccount.deleteMany({ where: { connectionId: scopedConnection.id } });
  await prisma.bankConnection.delete({ where: { id: scopedConnection.id } });
  check((await getEffectiveSubscription(manualUser, granted[0].expiresAt)).plan === "LITE",
    "Premium expires at the exact exclusive timestamp without any scheduled cleanup");
  check((await financialSnapshot()) === beforeBackfill,
    "Premium expiry never removes the existing wallet, transaction or journal");
  check((await prisma.paymentAllocation.count()) === cashBefore, "manual grant is never bank revenue");
  const revocation = await proposeSubscriptionAction(rootActor, {
    userId: manualUser, kind: "REVOKE_MANUAL", grantId: granted[0].id,
    reason: "Compensation reversed after operator review", idempotencyKey: `revoke_${suffix}`,
  });
  check((await getEffectiveSubscription(manualUser)).plan === "PREMIUM", "revocation request does not remove entitlement");
  await decideSubscriptionAction(approverActor, revocation.id, "APPROVE", "Revocation independently verified");
  check((await getEffectiveSubscription(manualUser)).plan === "LITE" &&
    (await prisma.subscriptionEvent.count({ where: { grantId: granted[0].id, kind: "GRANT_REVOKED" } })) === 1 &&
    (await prisma.subscription.findUniqueOrThrow({ where: { userId: manualUser } })).planCode === "LITE",
    "approved manual revoke immediately ends entitlement and retains event history");
  await expectUtilityAccess("DENY");
  check((await prisma.paymentAllocation.count()) === cashBefore, "revoke does not adjust bank receipts");
  await prisma.bankSyncOutbox.update({ where: { id: pausedJob.id }, data: { status: "PAUSED" } });
  await prisma.bankRawEvent.update({ where: { id: pausedEvent.id }, data: {
    processingStatus: "PAUSED", lastError: "PREMIUM_REQUIRED",
  } });
  check((await resumePremiumPausedBankEvents()) === 0 &&
    (await prisma.bankRawEvent.findUniqueOrThrow({ where: { id: pausedEvent.id } })).processingStatus === "PAUSED",
    "revoked Premium cannot restart paused synchronization");
  await prisma.bankSyncOutbox.delete({ where: { id: pausedJob.id } });
  await prisma.bankRawEvent.delete({ where: { id: pausedEvent.id } });
  await prisma.bankSyncOutbox.delete({ where: { id: unrelatedJob.id } });
  await prisma.bankRawEvent.delete({ where: { id: unrelatedPause.id } });
  await prisma.bankConsent.delete({ where: { id: pausedConsent.id } });
  await prisma.bankAccount.delete({ where: { id: pausedAccount.id } });
  await prisma.bankConnection.delete({ where: { id: pausedConnection.id } });
  if (oldEntitlementFlag === undefined) delete process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED;
  else process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = oldEntitlementFlag;
  check((await financialSnapshot()) === beforeBackfill,
    "approved Premium revocation never changes historic personal financial data");
  const rejection = await proposeSubscriptionAction(rootActor, {
    userId: manualUser, kind: "MANUAL_GRANT", period: "YEAR",
    reason: "Requested additional service compensation", idempotencyKey: `reject_${suffix}`,
  });
  await decideSubscriptionAction(approverActor, rejection.id, "REJECT", "Compensation policy does not apply");
  check((await getEffectiveSubscription(manualUser)).plan === "LITE" &&
    (await listSubscriptionActions("REJECTED")).some(a => a.id === rejection.id),
    "rejection remains in review history without entitlement");
  const renewalUser = `renewal_${suffix}`;
  await prisma.user.create({ data: mkUser(renewalUser) });
  const renewalRequests = await Promise.all(["MONTH", "YEAR"].map((period, idx) =>
    proposeSubscriptionAction(rootActor, { userId: renewalUser, kind: "MANUAL_GRANT",
      period: period as "MONTH" | "YEAR", reason: "Concurrent service recovery benefit",
      idempotencyKey: `manual_renewal_${idx}_${suffix}` })));
  await Promise.all(renewalRequests.map(request => decideSubscriptionAction(
    approverActor, request.id, "APPROVE", "Independent renewal review completed")));
  const renewalGrants = await prisma.subscriptionGrant.findMany({ where: { userId: renewalUser },
    orderBy: { startsAt: "asc" } });
  check(renewalGrants.length === 2 && renewalGrants[0].expiresAt.getTime() === renewalGrants[1].startsAt.getTime(),
    "two simultaneous approved manual grants never lose prepaid calendar time");
  // Force an event-insert failure: request, grant and projection must not partially resolve.
  const faultUser = `fault_${suffix}`;
  await prisma.user.create({ data: mkUser(faultUser) });
  const faultRequest = await proposeSubscriptionAction(rootActor, { userId: faultUser,
    kind: "MANUAL_GRANT", period: "MONTH", reason: "Recover account after service outage",
    idempotencyKey: `fault_${suffix}` });
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS finova_test_manual_rollback ON "SubscriptionEvent"');
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION finova_test_fail_manual_activation() RETURNS trigger AS $$
    BEGIN IF NEW."kind" = 'MANUAL_ACTIVATED' THEN RAISE EXCEPTION 'INJECTED_MANUAL_EVENT_FAILURE'; END IF;
    RETURN NEW; END; $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER finova_test_manual_rollback BEFORE INSERT ON "SubscriptionEvent"
    FOR EACH ROW EXECUTE FUNCTION finova_test_fail_manual_activation();
  `);
  let faultBlocked = false;
  try { await decideSubscriptionAction(approverActor, faultRequest.id, "APPROVE", "Reviewed recovery request independently"); }
  catch { faultBlocked = true; }
  finally { await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS finova_test_manual_rollback ON "SubscriptionEvent"'); }
  check(faultBlocked && (await prisma.subscriptionActionRequest.findUniqueOrThrow({ where: { id: faultRequest.id } })).status === "PENDING" &&
    (await prisma.subscriptionGrant.count({ where: { userId: faultUser } })) === 0 &&
    (await getEffectiveSubscription(faultUser)).plan === "LITE",
    "event fault rolls back grant and approval, leaving original proposal retryable");
  await decideSubscriptionAction(approverActor, faultRequest.id, "APPROVE", "Reviewed recovery request independently");
  check((await prisma.subscriptionGrant.count({ where: { userId: faultUser } })) === 1,
    "manual grant succeeds exactly once after event-insert recovery");
  await changeUserAccess(rootActor, member, "ACTIVE", "Restore fixture member for paid grant audit");
  await assertUserActive(member);
  check((await prisma.adminAuditLog.count({ where: { action: "USER_ACCESS_CHANGE", resourceId: member } })) === 3,
    "suspend, deactivate and reactivate each retain a separate audit event");
  const ordersBeforeReblock = await prisma.billingOrder.count({ where: { userId: member } });
  const grantsBeforeReblock = await prisma.subscriptionGrant.count({ where: { userId: member } });
  await changeUserAccess(rootActor, member, "SUSPENDED", "Temporarily block paid account to verify history retention");
  check((await prisma.billingOrder.count({ where: { userId: member } })) === ordersBeforeReblock &&
    (await prisma.subscriptionGrant.count({ where: { userId: member } })) === grantsBeforeReblock,
    "suspending a paid user does not remove orders or subscription grants");
  await changeUserAccess(rootActor, member, "ACTIVE", "Restore paid user after history retention test");
  await assertUserActive(member);
  let paidRevokeBlocked = false;
  try { await proposeSubscriptionAction(rootActor, { userId: member, kind: "REVOKE_MANUAL",
    grantId: grants[0].id, reason: "Should not revoke bank receipts here", idempotencyKey: `paid_${suffix}` }); }
  catch (e) { paidRevokeBlocked = e instanceof Error && e.message.includes("Chỉ có thể thu hồi grant thủ công"); }
  check(paidRevokeBlocked, "paid bank grants require separate refund/dispute flow");
  check((await prisma.adminAuditLog.count({ where: { resourceType: "SUBSCRIPTION_ACTION", resourceId: manualRequest.id } })) === 2,
    "proposal and approval are individually audited");
  await seedPremiumCatalogAndLiteSubscriptions();
  check((await prisma.subscription.findUniqueOrThrow({ where: { userId: member } })).planCode === "PREMIUM",
    "repeated backfill preserves the existing paid Premium projection");
  check((await financialSnapshot()) === beforeBackfill,
    "repeated backfill also preserves existing financial records after revocation");
  // Receiver rotation must require two distinct privileged operators and retain earlier order snapshots.
  const financeActor = { userId: member, role: "FINANCE_OPERATOR" as const };
  let financeProposalDenied = false;
  try { await proposeReceivingAccount(financeActor, { bankCode: "TEST", bankName: "Test Bank",
    accountName: "FINOVA TEST", accountNumber: "456789012345" }); }
  catch (error) { financeProposalDenied = error instanceof HttpError && error.status === 403; }
  check(financeProposalDenied, "Finance role cannot propose or configure a receiver via the service");
  const rotated = await proposeReceivingAccount(rootActor, { bankCode: "TEST", bankName: "Test Bank",
    accountName: "FINOVA TEST", accountNumber: "456789012345" });
  check(rotated.status === "PENDING_APPROVAL" && (await verifyBillingReceivingAccount(proposed.id, "12345678901")),
    "new receiver remains unapproved while old receiver is active");
  let financeApprovalDenied = false;
  try { await approveReceivingAccount(financeActor, rotated.id); }
  catch (error) { financeApprovalDenied = error instanceof HttpError && error.status === 403; }
  check(financeApprovalDenied, "Finance role cannot approve a receiver via the service");
  await approveReceivingAccount(approverActor, rotated.id);
  const oldOrderSnapshot = await getBillingOrder(member, orders[0].id);
  const newOrder = await createBillingOrder(legacyUser, monthly.id, `ROTATE_${suffix}`);
  const receiverList = await listReceivingAccounts();
  const newReceiver = receiverList.find(item => item.id === rotated.id);
  const oldReceiver = receiverList.find(item => item.id === proposed.id);
  check(oldOrderSnapshot.bank.accountNumber === "12345678901" && newOrder.bank.accountNumber === "456789012345" &&
    oldReceiver?.status === "DISABLED" && newReceiver?.status === "ACTIVE" &&
    newReceiver.accountMasked === "••••2345" &&
    receiverList.every(item => !("accountNumber" in item) && !("accountNumberEncrypted" in item)),
    "rotated receiver affects only new orders, existing checkout snapshots remain unchanged, admin list masked");
  check(!(await verifyBillingReceivingAccount(proposed.id, "12345678901")) &&
    (await verifyBillingReceivingAccount(rotated.id, "456789012345")),
    "disabled receiver rejects bank credits and newly approved receiver verifies");
  console.log("PASS: Admin, dual approval, idempotent checkout, RBAC data scoping, suspended sessions, verified payment, replay, underpayment/receiver/late review, atomic grants, concurrent renewal.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
