import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { getSubscriptionOperations, listSubscriptionActionPage, listSubscriptionLifecycle } from "../src/modules/billing/manual-subscriptions";

function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`ADMIN_SUBSCRIPTION_QA_FAILED: ${label}`);
}

async function main() {
  const name = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.slice(1);
  check(/^finova_admin_test_[A-Za-z0-9_]+$/.test(name), "an isolated Admin QA database is mandatory");
  const prefix = `qasub_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const userId = `${prefix}_user`;
  const base = new Date("2026-10-24T09:00:00.000Z");
  const start = new Date("2026-10-24T00:00:00.000Z");
  const end = new Date("2026-12-24T00:00:00.000Z");
  const grants = Array.from({ length: 56 }, (_, i) => `${prefix}_grant_${String(i).padStart(3, "0")}`);
  const events = Array.from({ length: 55 }, (_, i) => `${prefix}_event_${String(i).padStart(3, "0")}`);
  const pendingIds = Array.from({ length: 55 }, (_, i) => `${prefix}_pending_${String(i).padStart(3, "0")}`);
  const actionIds = ["approved", "rejected"].map(s => `${prefix}_${s}`);
  try {
    const before = await getSubscriptionOperations();
    await prisma.user.create({ data: { id: userId, name: "QA subscription lifecycle", email: `${userId}@example.test` } });
    await prisma.subscriptionGrant.createMany({ data: grants.map(id => ({
      id, userId, grantType: "MANUAL", startsAt: start, expiresAt: end,
    })) });
    await prisma.subscriptionEvent.createMany({ data: events.map((id, i) => ({
      id, userId, grantId: grants[i], kind: "MANUAL_ACTIVATED",
      createdAt: base, startsAt: start, expiresAt: end,
    })) });
    await prisma.subscriptionActionRequest.createMany({ data: [...pendingIds, ...actionIds].map((id, i) => ({
      id, userId, kind: "MANUAL_GRANT", status: i < 55 ? "PENDING" : i === 55 ? "APPROVED" : "REJECTED",
      billingPeriod: "MONTH" as const, periodCount: 1, reason: "QA subscription operations",
      requestedBy: `${prefix}_actor`, idempotencyKey: `qa_${i}_${prefix}`,
      reviewedBy: i >= 55 ? `${prefix}_reviewer` : null,
      reviewedAt: i >= 55 ? new Date() : null,
      reviewReason: i >= 55 ? "Independently reviewed QA subscription action" : null,
      createdAt: base,
      expiresAt: new Date(Date.now() + 60_000),
    })) });
    const after = await getSubscriptionOperations();
    check(after.pending === before.pending + 55 && after.approved === before.approved + 1 &&
      after.rejected === before.rejected + 1 && after.activeManualGrants === before.activeManualGrants + 56,
    "dashboard counts reconcile with PostgreSQL actions/grants");

    const requests1 = await listSubscriptionActionPage("PENDING");
    check(requests1.items.length === 50 && !!requests1.nextCursor &&
      requests1.items.map(a => a.id).join() === pendingIds.slice().reverse().slice(0, 50).join(),
    "pending review queue includes first 50 with stable equal-time order");
    const newerRequestId = `${prefix}_pending_newer`;
    await prisma.subscriptionActionRequest.create({ data: {
      id: newerRequestId, userId, kind: "MANUAL_GRANT", status: "PENDING",
      billingPeriod: "MONTH", periodCount: 1, reason: "New pending QA request",
      requestedBy: `${prefix}_actor`, idempotencyKey: `qa_new_${prefix}`,
      createdAt: new Date(base.getTime() + 1000), expiresAt: new Date(Date.now() + 60_000),
    } });
    const requests2 = await listSubscriptionActionPage("PENDING", requests1.nextCursor!);
    check(requests2.items.length === 5 && requests2.nextCursor === null &&
      requests2.items.map(a => a.id).join() === pendingIds.slice().reverse().slice(50).join(),
    "older pending requests remain reviewable after concurrent insert");
    check(![...requests1.items, ...requests2.items].some(a => a.id === newerRequestId) &&
      (await listSubscriptionActionPage("PENDING")).items[0].id === newerRequestId,
    "new pending request only appears on a refreshed first page");
    let crossStatusDenied = false;
    try { await listSubscriptionActionPage("APPROVED", requests1.nextCursor!); }
    catch (error) { crossStatusDenied = error instanceof Error; }
    check(crossStatusDenied, "review cursor cannot be reused on another status");

    const page1 = await listSubscriptionLifecycle();
    // This test uses a new, otherwise empty QA DB, so all 55 fixture events are visible.
    check(page1.items.length === 50 && !!page1.nextCursor, "first page / overflow");
    check(page1.items.map(e => e.id).join() === events.slice().reverse().slice(0, 50).join(),
      "equal-timestamp rows ordered by descending ID");

    const inserted = `${prefix}_inserted_ahead`;
    await prisma.subscriptionEvent.create({ data: { id: inserted, userId, grantId: grants[55],
      kind: "MANUAL_ACTIVATED", createdAt: new Date(base.getTime() + 1000),
      startsAt: start, expiresAt: end } });
    const page2 = await listSubscriptionLifecycle(page1.nextCursor!);
    check(page2.items.length === 5 && page2.nextCursor === null &&
      page2.items.map(e => e.id).join() === events.slice().reverse().slice(50).join(),
      "later page stable across concurrent inserts above the cursor");
    const combined = [...page1.items, ...page2.items];
    check(new Set(combined.map(e => e.id)).size === 55 && !combined.some(e => e.id === inserted),
      "no duplicates, skipped old rows or exposure of a newer event");
    const latest = await listSubscriptionLifecycle();
    check(latest.items[0].id === inserted, "new events appear on a fresh first page");
    const index = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'SubscriptionEvent'
        AND indexname = 'SubscriptionEvent_createdAt_id_idx'`;
    check(index.length === 1 && /"createdAt" DESC, (?:"id"|id) DESC/.test(index[0].indexdef),
      "composite PostgreSQL descending keyset index");
    const requestIndex = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'SubscriptionActionRequest'
        AND indexname = 'SubscriptionActionRequest_status_createdAt_id_idx'`;
    check(requestIndex.length === 1 && /(?:"status"|status), "createdAt" DESC, (?:"id"|id) DESC/.test(requestIndex[0].indexdef),
      "status-scoped review keyset index");
    console.log("ADMIN_SUBSCRIPTION_QA_PASS: counts, 55 pending requests and events, cursor scoping, concurrent inserts, indexes");
  } finally {
    await prisma.subscriptionEvent.deleteMany({ where: { userId } });
    await prisma.subscriptionActionRequest.deleteMany({ where: { userId } });
    await prisma.subscriptionGrant.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
