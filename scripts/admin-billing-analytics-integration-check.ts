/** Billing KPI PostgreSQL QA: uses isolated finova_admin_test_* and cleans only its fixture. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { getBillingAnalytics } from "../src/modules/admin/billing-analytics";

const at = (value: string) => new Date(value);
const now = at("2026-10-25T05:00:00.000Z");

async function main() {
  assert.match(new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname,
    /^\/finova_admin_test_[a-zA-Z0-9_]+$/, "Isolated Admin QA database required");
  const baseline = await getBillingAnalytics(7, now);
  const marker = randomUUID().replaceAll("-", "");
  const users = ["renew", "expire", "refunded", "pending", "first"].map(value => `qa_billing_kpi_${value}_${marker}`);
  const eventIds: string[] = [];
  const orderIds: string[] = [];
  const grantIds: string[] = [];
  let priceId: string | undefined;
  let receiverId: string | undefined;

  function diff<T extends keyof typeof baseline.totals>(key: T, result: typeof baseline) {
    return Number(result.totals[key]) - Number(baseline.totals[key]);
  }

  try {
    await prisma.user.createMany({ data: users.map(id => ({
      id, name: "Synthetic KPI QA", email: `${id}@example.test`, emailVerified: true,
    })) });
    await prisma.subscriptionPlan.upsert({ where: { code: "PREMIUM" },
      create: { code: "PREMIUM", displayName: "Premium" }, update: {} });
    const price = await prisma.planPrice.create({ data: {
      planCode: "PREMIUM", productCode: `QA_KPI_${marker}`, billingPeriod: "MONTH",
      periodCount: 1, priceVnd: 29000, version: 1,
    } });
    priceId = price.id;
    const receiver = await prisma.billingReceivingAccount.create({ data: {
      bankCode: "QA", bankName: "TEST ONLY", accountName: "QA ONLY", accountNumberEncrypted: "QA_ONLY",
      accountNumberLast4: "0000", status: "DISABLED", createdBy: users[0]!,
    } });
    receiverId = receiver.id;

    async function order(index: number, userId: string, createdAt: string, status: "PAID" | "REFUNDED" | "PENDING_PAYMENT",
      period: "MONTH" | "YEAR", paidAt?: string) {
      const result = await prisma.billingOrder.create({ data: {
        userId, priceId: price.id, receiverAccountId: receiver.id,
        orderCode: `QAKPI${index}_${marker}`, idempotencyKey: `qa_kpi_${index}_${marker}`,
        planCode: "PREMIUM", billingPeriodSnapshot: period, periodCountSnapshot: 1,
        amountDueVnd: period === "MONTH" ? 29000 : 199000,
        createdAt: at(createdAt), expiresAt: at("2026-11-30T00:00:00Z"),
        paidAt: paidAt ? at(paidAt) : null, status,
      } });
      orderIds.push(result.id);
      return result;
    }

    async function payment(index: number, orderId: string | null, occurredAt: string, receivedAt: string,
      matchStatus: string, amountVnd: number, matchedAt?: string) {
      const event = await prisma.billingPaymentEvent.create({ data: {
        provider: "QA_KPI", providerAccountRef: receiver.id,
        providerTransactionId: `qa_${index}_${marker}`, direction: "IN", amountVnd,
        reference: `QAKPI${index}_${marker}`, occurredAt: at(occurredAt), receivedAt: at(receivedAt),
        verificationStatus: "VERIFIED", matchStatus,
      } });
      eventIds.push(event.id);
      if (orderId && matchedAt) await prisma.paymentAllocation.create({ data: {
        paymentEventId: event.id, orderId, amountVnd, matchedAt: at(matchedAt),
      } });
    }

    const prior = await prisma.subscriptionGrant.create({ data: {
      userId: users[0]!, grantType: "BANK_PAYMENT", billingPeriod: "MONTH", periodCount: 1,
      startsAt: at("2026-09-24T07:00:00Z"), expiresAt: at("2026-10-24T07:00:00Z"),
      createdAt: at("2026-10-18T10:00:00Z"),
    } });
    grantIds.push(prior.id);
    const expired = await prisma.subscriptionGrant.create({ data: {
      userId: users[1]!, grantType: "BANK_PAYMENT", billingPeriod: "MONTH", periodCount: 1,
      startsAt: at("2026-09-24T03:00:00Z"), expiresAt: at("2026-10-24T03:00:00Z"),
      createdAt: at("2026-10-17T03:00:00Z"),
    } });
    grantIds.push(expired.id);

    const paid = await order(1, users[0]!, "2026-10-24T16:59:59.999Z", "PAID", "MONTH", "2026-10-24T16:59:59.999Z");
    await order(2, users[3]!, "2026-10-24T10:00:00Z", "PENDING_PAYMENT", "MONTH");
    const refunded = await order(3, users[2]!, "2026-10-24T17:00:00Z", "REFUNDED", "YEAR", "2026-10-24T17:00:00Z");
    const repeat = await order(4, users[0]!, "2026-10-24T19:00:00Z", "PAID", "MONTH", "2026-10-24T19:00:00Z");
    const first = await order(5, users[4]!, "2026-10-25T03:00:00Z", "PAID", "MONTH", "2026-10-25T03:00:00Z");
    const renewed = await prisma.subscriptionGrant.create({ data: {
      userId: users[0]!, orderId: paid.id, grantType: "BANK_PAYMENT", billingPeriod: "MONTH", periodCount: 1,
      startsAt: at("2026-10-24T07:00:00Z"), expiresAt: at("2026-11-24T07:00:00Z"),
      createdAt: at("2026-10-24T17:00:00Z"),
    } });
    grantIds.push(renewed.id);
    const renewedAgain = await prisma.subscriptionGrant.create({ data: {
      userId: users[0]!, orderId: repeat.id, grantType: "BANK_PAYMENT", billingPeriod: "MONTH", periodCount: 1,
      startsAt: at("2026-11-24T07:00:00Z"), expiresAt: at("2026-12-24T07:00:00Z"),
      createdAt: at("2026-10-24T19:00:00Z"),
    } });
    grantIds.push(renewedAgain.id);
    const firstGrant = await prisma.subscriptionGrant.create({ data: {
      userId: users[4]!, orderId: first.id, grantType: "BANK_PAYMENT", billingPeriod: "MONTH", periodCount: 1,
      startsAt: at("2026-10-25T03:00:00Z"), expiresAt: at("2026-11-25T03:00:00Z"),
      createdAt: at("2026-10-25T03:00:00Z"),
    } });
    grantIds.push(firstGrant.id);
    await payment(1, paid.id, "2026-10-24T16:59:59.999Z", "2026-10-24T16:59:59.999Z",
      "MATCHED", 29000, "2026-10-24T17:00:00Z");
    await payment(3, refunded.id, "2026-10-24T17:00:00Z", "2026-10-24T17:00:00Z",
      "MATCHED", 199000, "2026-10-25T04:00:00Z");
    await payment(4, null, "2026-10-24T17:00:00Z", "2026-10-24T17:00:00Z", "UNMATCHED", 29000);
    await payment(5, repeat.id, "2026-10-24T19:00:00Z", "2026-10-24T19:00:00Z", "MATCHED", 29000, "2026-10-25T04:00:00Z");
    await payment(6, first.id, "2026-10-25T03:00:00Z", "2026-10-25T03:00:00Z", "MATCHED", 29000, "2026-10-25T04:00:00Z");

    const result = await getBillingAnalytics(7, now);
    for (const [key, expected] of Object.entries({ orders: 5, paidFromOrders: 4, activatedFromOrders: 3,
      monthlyOrders: 4, yearlyOrders: 1, refundedOrderCohort: 1, paidGrants: 3, renewals: 2,
      expiredUsers: 1, allocatedCount: 4, verifiedEvents: 5, exceptions: 1, unresolvedEvents: 1,
      paidUsers: 2, firstPaidUsers: 1, renewingUsers: 1, monthlyGrants: 3, yearlyGrants: 0,
      reviewIncomingCount: 1 })) {
      assert.equal(diff(key as keyof typeof baseline.totals, result), expected, key);
    }
    assert.equal(BigInt(result.totals.grossVnd) - BigInt(baseline.totals.grossVnd), BigInt(286000));
    assert.equal(BigInt(result.totals.reviewIncomingVnd) - BigInt(baseline.totals.reviewIncomingVnd), BigInt(29000));
    for (const [day, expected] of Object.entries({
      "2026-10-24": { orders: 2, paidFromOrders: 1, activatedFromOrders: 1, expiredUsers: 1 },
      "2026-10-25": { orders: 3, paidFromOrders: 3, activatedFromOrders: 2, paidGrants: 3, renewals: 2,
        allocatedCount: 4, exceptions: 1, monthlyGrants: 3, reviewIncomingCount: 1 },
    })) {
      const before = baseline.rows.find(row => row.day === day)!;
      const after = result.rows.find(row => row.day === day)!;
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(Number(after[key as keyof typeof after]) - Number(before[key as keyof typeof before]), value,
          `${day} ${key}`);
      }
    }
    assert.equal(result.rows.length, 7);
    assert.equal(result.totals.createdToPaidRate, result.totals.paidFromOrders / result.totals.orders);
    assert.equal((await getBillingAnalytics(7, at("2025-01-01T10:00:00Z"))).totals.grossVnd, "0");
    console.log("ADMIN_BILLING_KPI_QA_PASS: PostgreSQL dates, multiple grants per user, first paid/renewal distinct users, verified review amount, gross and cleanup");
  } finally {
    await prisma.paymentAllocation.deleteMany({ where: { paymentEventId: { in: eventIds } } });
    await prisma.billingPaymentEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.subscriptionGrant.deleteMany({ where: { id: { in: grantIds } } });
    await prisma.billingOrder.deleteMany({ where: { id: { in: orderIds } } });
    if (priceId) await prisma.planPrice.delete({ where: { id: priceId } });
    if (receiverId) await prisma.billingReceivingAccount.delete({ where: { id: receiverId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
