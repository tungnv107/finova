/** Isolated PostgreSQL QA for server-confirmed checkout/history states. Synthetic credit is never a provider UAT. */
import { randomBytes, randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "../src/lib/db";
import { BillingOrderProgress } from "../src/components/billing-order-progress";
import { featureAllowed } from "../src/modules/billing/domain";
import { seedPremiumCatalogAndLiteSubscriptions } from "../src/modules/billing/seed";
import { approveReceivingAccount, createBillingOrder, getBillingOrder, listBillingOrders, proposeReceivingAccount } from "../src/modules/billing/service";
import { recordVerifiedBankCredit, reconcileVerifiedBankCredit } from "../src/modules/billing/reconciliation";
import { processPendingBillingNotices } from "../src/modules/billing/outbox";
import { getEffectiveSubscription } from "../src/server/premium";
import { HttpError } from "../src/server/context";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`ORDER_HISTORY_QA_FAILED: ${message}`);
}

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
  check(db.hostname === "127.0.0.1" && db.port === "55433" &&
    /^\/finova_admin_test_history_[a-zA-Z0-9_]+$/.test(db.pathname), "dedicated local history QA database required");
  process.env.FINOVA_ADMIN_ENABLED = "1";
  process.env.FINOVA_BILLING_CHECKOUT_ENABLED = "1";
  process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "1";
  process.env.FINOVA_BILLING_ENCRYPTION_KEY = randomBytes(32).toString("hex");

  const migrations = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  check(Number(migrations[0]?.count) >= 28, "all QA migrations applied");
  check(await prisma.user.count() === 0, "disposable, empty QA database required");

  const suffix = randomUUID().replaceAll("-", "");
  const [adminId, approverId, liteId, anotherId] = ["admin", "approver", "lite", "another"].map(prefix => `${prefix}_${suffix}`);
  await prisma.user.createMany({ data: [adminId, approverId, liteId, anotherId].map(id => ({
    id, name: id.slice(0, 40), email: `${id}@example.test`, emailVerified: true,
  })) });
  await seedPremiumCatalogAndLiteSubscriptions();
  const admin = { userId: adminId, role: "SUPER_ADMIN" as const };
  const approver = { userId: approverId, role: "SUPER_ADMIN" as const };
  const receiver = await proposeReceivingAccount(admin, {
    bankCode: "QA", bankName: "QA Bank", accountName: "FINOVA QA", accountNumber: "123456789012",
  });
  await approveReceivingAccount(approver, receiver.id);
  const price = await prisma.planPrice.findFirstOrThrow({ where: { productCode: "PREMIUM_MONTHLY", isPublished: true } });
  const order = (label: string) => createBillingOrder(liteId, price.id, `${label}_${suffix}`);

  const pending = await order("PENDING");
  check(pending.status === "PENDING_PAYMENT" && !(await listBillingOrders(liteId)).some(x => x.paidAt),
    "order creation never acknowledges money received");
  check((await getEffectiveSubscription(liteId)).plan === "LITE", "Lite remains Lite after creating order");
  check(!featureAllowed("LITE", "NOTIFICATIONS"), "Lite cannot use optional Premium notifications");

  const expired = await order("EXPIRED");
  await prisma.billingOrder.update({ where: { id: expired.id }, data: {
    createdAt: new Date(Date.now() - 48 * 3600_000), expiresAt: new Date(Date.now() - 24 * 3600_000),
  } });
  const review = await order("REVIEW");
  await prisma.billingOrder.update({ where: { id: review.id }, data: { status: "REVIEW" } });
  const received = await order("PAID_PENDING_ACTIVATION");
  await prisma.billingOrder.update({ where: { id: received.id }, data: { status: "PAID", paidAt: new Date() } });
  check((await getEffectiveSubscription(liteId)).plan === "LITE", "PAID display state alone cannot grant Premium");

  const verifiedOrder = await order("VERIFIED");
  const event = await recordVerifiedBankCredit({ provider: "INTEGRATION_FIXTURE",
    receiverAccountId: receiver.id, providerTransactionId: `history_${suffix}`, direction: "IN",
    amountVnd: String(verifiedOrder.amountVnd), reference: `PAY ${verifiedOrder.orderCode}`, occurredAt: new Date() });
  check((await reconcileVerifiedBankCredit(event.id)).status === "MATCHED", "verified credit matched exactly once");
  const active = await getBillingOrder(liteId, verifiedOrder.id);
  check(active.status === "PAID" && active.paidAt && active.activatedAt, "matched credit records paid and activated timestamps");
  check((await getEffectiveSubscription(liteId)).plan === "PREMIUM", "verified credit activates entitlement");

  await processPendingBillingNotices();
  check((await prisma.billingNotice.count({ where: { userId: liteId, orderId: active.id } })) === 1,
    "billing activation notice delivered in independent business channel");

  // Emulate an already-approved refund/revocation in this isolated DB. The refund policy workflow
  // remains an open task; this fixture verifies that history does not imply CURRENT entitlement.
  const revokedAt = new Date();
  await prisma.subscriptionGrant.updateMany({ where: { userId: liteId, orderId: active.id }, data: { revokedAt } });
  await prisma.billingOrder.update({ where: { id: active.id }, data: { status: "REFUNDED" } });
  check((await getEffectiveSubscription(liteId)).plan === "LITE", "historical activation does not imply current Premium");
  const list = await listBillingOrders(liteId);
  const statusFor = (id: string) => list.find(item => item.id === id);
  check(statusFor(pending.id)?.status === "PENDING_PAYMENT", "pending remains pending");
  check(statusFor(expired.id)?.status === "EXPIRED", "expired is derived from due time");
  check(statusFor(review.id)?.status === "REVIEW", "review is retained");
  check(statusFor(received.id)?.status === "PAID" && statusFor(received.id)?.paidAt && !statusFor(received.id)?.activatedAt,
    "paid but unactivated distinct from Premium grant");
  check(statusFor(active.id)?.status === "REFUNDED" && statusFor(active.id)?.paidAt && statusFor(active.id)?.activatedAt,
    "historical paid/activated timestamps survive refund");
  const refunded = statusFor(active.id)!;
  const html = renderToStaticMarkup(createElement(BillingOrderProgress, {
    status: refunded.status, createdAt: refunded.createdAt, expiresAt: refunded.expiresAt,
    paidAt: refunded.paidAt, activatedAt: refunded.activatedAt, checkoutOpen: false,
  }));
  check(html.includes("Từng kích hoạt Premium") && html.includes("Đã hoàn tiền") &&
    !html.includes("<strong>Đã kích hoạt Premium</strong>"), "refunded UI shows history, not current access");
  check((await prisma.billingNotice.count({ where: { userId: liteId, orderId: active.id } })) === 1,
    "Lite still retains business billing confirmation after Premium revoked");

  let ownerDenied = false;
  try { await getBillingOrder(anotherId, active.id); }
  catch (error) { ownerDenied = error instanceof HttpError && error.status === 404; }
  check(ownerDenied && (await listBillingOrders(anotherId)).length === 0,
    "other users cannot enumerate or fetch owner's orders");

  console.log("PASS: 28 migrations, owner scoping, PENDING/EXPIRED/REVIEW/PAID/ACTIVATED/REFUNDED lifecycle, effective Lite/Premium, durable Lite billing notice, refunded history SSR.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
