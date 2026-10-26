/** AD5-08: real PostgreSQL aggregate queries and simulated worker/provider silence.
 * Fixtures and audit content are disposable; no external payments or production data.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { auth } from "../src/server/auth";
import { getBillingOperationalAlerts } from "../src/modules/admin/billing-operational-alerts";

const db = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
assert.equal(db.hostname, "127.0.0.1");
assert.equal(db.port, "55433");
assert.equal(db.pathname, "/finova_admin_test_ad206_20261026");

const now = new Date();
const minutesBefore = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const minutesAfter = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

// A previous browser run can leave role identities behind if its cleanup was
// interrupted after deleting billing fixtures. Remove only this test's exact
// disposable identities, and only on the explicitly validated local QA DB.
async function cleanupRoleFixtures(userIds: string[]) {
  if (userIds.length === 0) return;
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.systemRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.productPageviewReceipt.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.productUsageDaily.deleteMany({ where: { userId: { in: userIds } } });
  for (const id of userIds) {
    const workspaceId = `personal-${id}`;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }, select: { createdById: true },
    });
    assert.ok(!workspace || workspace.createdById === id,
      "QA cleanup cannot delete another user's workspace");
    await prisma.category.deleteMany({ where: { workspaceId } });
    await prisma.ledgerAccount.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  }
  await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  const migrationCount = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  assert.equal(Number(migrationCount[0]?.n), 31);
  const existingIds = (await prisma.user.findMany({ select: { id: true } })).map(row => row.id);
  const staleRolePattern = /^qa_ad508_(?:SUPER_ADMIN|ADMIN|FINANCE_OPERATOR|ANALYST|USER)_[0-9a-f]{32}$/;
  assert.ok(existingIds.every(id => staleRolePattern.test(id)),
    "Use only an isolated AD5-08 QA database with disposable role fixtures");
  if (existingIds.length > 0) {
    await cleanupRoleFixtures(existingIds);
    console.log(`PASS: recovered ${existingIds.length} interrupted AD5-08 role fixtures`);
  }
  assert.equal(await prisma.user.count(), 0, "AD5-08 QA database must now be empty");
  const marker = randomUUID().replaceAll("-", "");
  const userId = `qa_ad508_${marker}`;
  const assignableRoles = ["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR", "ANALYST"] as const;
  const roles = [...assignableRoles, "USER"] as const;
  const roleUsers = roles.map(role => `qa_ad508_${role}_${marker}`);
  let receiverId: string | undefined;
  let priceId: string | undefined;
  const orders: string[] = [];
  const events: string[] = [];
  let httpIncidentId: string | undefined;
  try {
    const baseline = await getBillingOperationalAlerts(now);
    assert.deepEqual(baseline.alerts, [], "QA database must not have existing operational alerts");
    await prisma.user.create({ data: { id: userId, name: "AD5-08 QA", email: `${userId}@example.test` } });
    await prisma.subscriptionPlan.upsert({ where: { code: "PREMIUM" },
      create: { code: "PREMIUM", displayName: "Premium" }, update: {} });
    const price = await prisma.planPrice.create({ data: {
      planCode: "PREMIUM", productCode: `QA_ALERT_${marker}`, version: 1,
      billingPeriod: "MONTH", priceVnd: 29000,
    } });
    priceId = price.id;
    const receiver = await prisma.billingReceivingAccount.create({ data: {
      bankCode: "QA", bankName: "QA Bank", accountName: "Synthetic QA",
      accountNumberEncrypted: "synthetic-only", accountNumberLast4: "0000",
      status: "DISABLED", createdBy: userId,
    } });
    receiverId = receiver.id;

    async function order(index: number, status: "PENDING_PAYMENT" | "PAID", createdAt: Date, expiresAt: Date) {
      const row = await prisma.billingOrder.create({ data: {
        userId, priceId: price.id, receiverAccountId: receiver.id,
        orderCode: `QAOPS${index}${marker}`, idempotencyKey: `qaops_${index}_${marker}`,
        planCode: "PREMIUM", billingPeriodSnapshot: "MONTH", periodCountSnapshot: 1,
        amountDueVnd: 29000, status, createdAt, expiresAt,
        paidAt: status === "PAID" ? minutesBefore(30) : null,
      } });
      orders.push(row.id);
      return row;
    }
    await order(1, "PENDING_PAYMENT", minutesBefore(180), minutesBefore(60));
    await order(2, "PENDING_PAYMENT", minutesBefore(10), minutesAfter(60));
    const paid1 = await order(3, "PAID", minutesBefore(60), minutesAfter(60));
    const paid2 = await order(4, "PAID", minutesBefore(60), minutesAfter(60));

    async function payment(index: number, matchStatus: string, receivedAt: Date,
      extras: { deadLetteredAt?: Date; attemptCount?: number; nextAttemptAt?: Date } = {}) {
      const row = await prisma.billingPaymentEvent.create({ data: {
        provider: "QA_AD508", providerAccountRef: receiver.id,
        providerTransactionId: `qa_${index}_${marker}`, direction: "IN", amountVnd: 29000,
        reference: `synthetic_${index}`, occurredAt: receivedAt, receivedAt,
        verificationStatus: "VERIFIED", matchStatus, ...extras,
      } });
      events.push(row.id);
      return row;
    }
    await payment(1, "RECEIVED", minutesBefore(45), {
      deadLetteredAt: minutesBefore(20), attemptCount: 6 });
    await payment(2, "RECEIVED", minutesBefore(16), { nextAttemptAt: minutesBefore(1) });
    await payment(3, "UNMATCHED", minutesBefore(16));
    const fresh = await payment(4, "MATCHED", minutesBefore(1));
    await prisma.billingOutbox.create({ data: {
      orderId: paid1.id, userId, kind: "PREMIUM_ACTIVATED", status: "PENDING",
      createdAt: minutesBefore(40), attemptCount: 6, deadLetteredAt: minutesBefore(20),
    } });
    await prisma.billingOutbox.create({ data: {
      orderId: paid2.id, userId, kind: "PREMIUM_ACTIVATED", status: "PENDING",
      createdAt: minutesBefore(16), nextAttemptAt: minutesBefore(1),
    } });
    await prisma.adminAuditLog.createMany({ data: Array.from({ length: 5 }, (_, index) => ({
      actorId: userId, action: "RECEIVER_APPROVE", resourceType: "BillingReceivingAccount",
      resourceId: `synthetic-${index}`, createdAt: minutesBefore(1),
    })) });

    const active = await getBillingOperationalAlerts(now);
    assert.deepEqual(active.alerts.map(alert => alert.code), [
      "PAYMENT_DLQ", "NOTICE_DLQ", "MATCHING_LAG", "NOTICE_LAG",
      "PAYMENT_EXCEPTION", "OVERDUE_ORDER", "ADMIN_AUDIT_BURST",
    ]);
    assert.ok(active.alerts.every(alert => alert.count === 1));
    assert.ok(active.alerts.every(alert => alert.href.startsWith("/admin/") &&
      !JSON.stringify(alert).includes(userId) && !JSON.stringify(alert).includes(marker)));
    console.log("PASS: seven operational alerts, exact aggregate counts, no PII");

    await prisma.billingPaymentEvent.delete({ where: { id: fresh.id } });
    await prisma.billingPaymentEvent.updateMany({ where: { id: { in: events.filter(id => id !== fresh.id) } },
      data: { receivedAt: minutesBefore(181), occurredAt: minutesBefore(181) } });
    const silent = await getBillingOperationalAlerts(now);
    const noSignal = silent.alerts.find(item => item.code === "IPN_NO_SIGNAL");
    assert.ok(noSignal);
    assert.equal(noSignal?.count, 1);
    assert.equal(noSignal?.severity, "info");
    assert.ok(noSignal.explanation.includes("chưa xác nhận IPN/provider bị gián đoạn"));
    console.log("PASS: provider-silence simulation emits info, never asserts provider outage");

    // Signed real-session requests render the Next.js page for authorized operators only.
    await prisma.user.createMany({ data: roleUsers.map(id => ({
      id, name: "QA Operations", email: `${id}@example.test`,
    })) });
    await prisma.systemRoleAssignment.createMany({ data: assignableRoles.map((role, index) => ({
      userId: roleUsers[index]!, role,
    })) });
    const authContext = await auth.$context;
    const cookieName = authContext.authCookies.sessionToken.name;
    const base = new URL(process.env.BETTER_AUTH_URL ?? "http://invalid");
    assert.equal(base.href, "http://localhost:31646/");
    const cookies = new Map<string, string>();
    for (const [index, role] of roles.entries()) {
      const token = randomUUID();
      await prisma.session.create({ data: {
        id: randomUUID(), token, userId: roleUsers[index]!,
        createdAt: new Date(), expiresAt: minutesAfter(60),
      } });
      const signature = createHmac("sha256", authContext.secret).update(token).digest("base64");
      const cookie = `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`;
      cookies.set(role, cookie);
      const response = await fetch(new URL("/admin/billing/operations", base), {
        headers: { cookie }, redirect: "manual",
      });
      const allowed = role !== "ANALYST" && role !== "USER";
      assert.equal(response.status, allowed ? 200 : 403, `HTTP role ${role}`);
      const html = await response.text();
      if (allowed) {
        for (const code of ["PAYMENT_DLQ", "NOTICE_DLQ", "MATCHING_LAG", "NOTICE_LAG",
          "PAYMENT_EXCEPTION", "OVERDUE_ORDER", "ADMIN_AUDIT_BURST", "IPN_NO_SIGNAL"]) {
          assert.ok(html.includes(code), `${role} missing ${code}`);
        }
        assert.ok(!html.includes(marker) && !html.includes("synthetic_"), "No fixture PII in dashboard");
      } else {
        assert.ok(!html.includes("PAYMENT_DLQ"), `${role} leaked operational alerts`);
      }
    }
    console.log("PASS: signed-role 200/403 for Super Admin/Admin/Finance/Analyst/User and aggregate-only page");

    // Real Next.js inbox/ACK routes, backed by signed sessions and isolated QA rows.
    const httpIncident = await prisma.billingOperationalIncident.create({ data: {
      code: "QA_HTTP_OPERATIONS", severity: "warning", count: 1,
      title: "QA operational notification", explanation: "Aggregate-only QA message",
      href: "/admin/billing/payments?review=1",
    } });
    httpIncidentId = httpIncident.id;
    await prisma.billingOperationalDelivery.create({ data: {
      incidentId: httpIncident.id, generation: 1, userId: roleUsers[2]!,
    } });
    for (const role of roles) {
      const response = await fetch(new URL("/admin/billing/operations/inbox", base), {
        headers: { cookie: cookies.get(role)! }, redirect: "manual",
      });
      const allowed = role !== "ANALYST" && role !== "USER";
      assert.equal(response.status, allowed ? 200 : 403, `Inbox role ${role}`);
      const html = await response.text();
      assert.equal(response.headers.get("cache-control")?.includes("no-store"), true);
      assert.equal(html.includes("QA_HTTP_OPERATIONS"), role === "SUPER_ADMIN" || role === "FINANCE_OPERATOR",
        `Inbox scope ${role}`);
      assert.ok(!html.includes("@example.test") && !html.includes("synthetic_"));
    }
    const ackUrl = new URL(`/api/v1/admin/billing/operations/${httpIncident.id}/ack`, base);
    async function ack(role: typeof roles[number], origin?: string) {
      const response = await fetch(ackUrl, { method: "POST",
        headers: { cookie: cookies.get(role)!, ...(origin ? { origin } : {}) },
      });
      return { status: response.status, json: await response.json() };
    }
    assert.equal((await ack("ANALYST", base.origin)).status, 403);
    assert.equal((await ack("USER", base.origin)).status, 403);
    assert.equal((await ack("ADMIN", base.origin)).status, 403, "Unassigned Admin cannot ACK");
    assert.equal((await ack("FINANCE_OPERATOR")).status, 403, "Missing Origin blocked");
    assert.equal((await ack("FINANCE_OPERATOR", "https://other.example")).status, 403);
    const accepted = await ack("FINANCE_OPERATOR", base.origin);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.json.data.changed, true);
    assert.equal((await ack("FINANCE_OPERATOR", base.origin)).json.data.changed, false,
      "Repeated ACK must be idempotent");
    assert.equal((await prisma.billingOperationalHistory.count({ where: {
      incidentId: httpIncident.id, action: "ACKNOWLEDGED",
    } })), 1);
    console.log("PASS: signed inbox role scope, Origin/CSRF, assigned ACK, audit and idempotency");
  } finally {
    if (httpIncidentId) {
      await prisma.billingOperationalRelay.deleteMany({ where: { incidentId: httpIncidentId } });
      await prisma.billingOperationalDelivery.deleteMany({ where: { incidentId: httpIncidentId } });
      await prisma.billingOperationalHistory.deleteMany({ where: { incidentId: httpIncidentId } });
      await prisma.billingOperationalIncident.delete({ where: { id: httpIncidentId } });
      await prisma.adminAuditLog.deleteMany({ where: {
        resourceId: httpIncidentId, action: "BILLING_INCIDENT_ACK",
      } });
    }
    await prisma.billingOutbox.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.billingPaymentEvent.deleteMany({ where: { id: { in: events } } });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: userId } });
    await prisma.billingOrder.deleteMany({ where: { id: { in: orders } } });
    if (receiverId) await prisma.billingReceivingAccount.delete({ where: { id: receiverId } });
    if (priceId) await prisma.planPrice.delete({ where: { id: priceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await cleanupRoleFixtures(roleUsers);
    assert.equal(await prisma.user.count({ where: { id: userId } }), 0);
    assert.equal(await prisma.user.count({ where: { id: { in: roleUsers } } }), 0);
    assert.equal(await prisma.workspace.count({ where: { id: { in: roleUsers.map(id => `personal-${id}`) } } }), 0);
    assert.equal(await prisma.billingPaymentEvent.count({ where: { provider: "QA_AD508" } }), 0);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
