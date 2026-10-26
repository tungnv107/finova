/** End-to-end handler + PostgreSQL QA fixture. Refuses all databases except finova_admin_test_*. */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { auth } from "../src/server/auth";
import { GET } from "../src/app/api/v1/admin/analytics/export/route";
import { prepareAdminAggregateReport } from "../src/modules/admin/analytics-export";
import { backfillUsageDaily, recordAuthenticatedPageview, pruneUsageAnalytics } from "../src/modules/admin/usage";

const now = new Date("2026-10-24T16:59:59.999Z");
const inside = new Date("2026-10-17T17:00:00.000Z");
const before = new Date("2026-10-17T16:59:59.999Z");
const after = new Date("2026-10-24T17:00:00.000Z");

async function main() {
  const dbName = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname;
  assert.match(dbName, /^\/finova_admin_test_[a-zA-Z0-9_]+$/, "QA database is required");
  process.env.FINOVA_ADMIN_ENABLED = "1";
  process.env.FINOVA_USAGE_ANALYTICS_ENABLED = "1";
  const baselineBilling = await prepareAdminAggregateReport("billing", 7, now);
  const baselineTraffic = await prepareAdminAggregateReport("traffic", 7, now);
  const marker = randomUUID().replaceAll("-", "");
  const roles = ["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR", "ANALYST"] as const;
  const users = [...roles, "USER"] as const;
  const ids = users.map(role => `exp_${role.toLowerCase()}_${marker}`);
  await prisma.user.createMany({ data: ids.map(id => ({
    id, name: "QA Export", email: `${id}@example.test`, emailVerified: true,
  })) });
  await prisma.systemRoleAssignment.createMany({ data: roles.map((role, i) => ({
    userId: ids[i]!, role,
  })) });
  await prisma.subscriptionPlan.upsert({ where: { code: "PREMIUM" },
    create: { code: "PREMIUM", displayName: "Premium" }, update: {} });
  const price = await prisma.planPrice.create({ data: {
    planCode: "PREMIUM", productCode: `QA_EXPORT_${marker}`, billingPeriod: "MONTH",
    periodCount: 1, priceVnd: 29000, version: 1,
  } });
  const receiver = await prisma.billingReceivingAccount.create({ data: {
    bankCode: "QA", bankName: "QA BANK", accountName: "QA ONLY",
    accountNumberEncrypted: "synthetic-fixture-not-a-real-account",
    accountNumberLast4: "0000", status: "ACTIVE", createdBy: ids[0]!,
  } });

  async function fixture(n: number, createdAt: Date, paidAt: Date, matchedAt: Date,
    amount: number, status: "PAID" | "REFUNDED") {
    const order = await prisma.billingOrder.create({ data: {
      userId: ids[4]!, priceId: price.id, receiverAccountId: receiver.id,
      orderCode: `QAEXP${n}_${marker}`, idempotencyKey: `qaexp${n}_${marker}`,
      planCode: "PREMIUM", billingPeriodSnapshot: "MONTH", periodCountSnapshot: 1,
      amountDueVnd: amount, status, createdAt, paidAt,
      expiresAt: new Date("2026-11-24T17:00:00Z"),
    } });
    const event = await prisma.billingPaymentEvent.create({ data: {
      provider: "QA_EXPORT_FIXTURE", providerAccountRef: `qa_${marker}`,
      providerTransactionId: `qa_export_${n}_${marker}`,
      direction: "IN", amountVnd: amount, reference: `Private ${marker}`,
      occurredAt: paidAt, verificationStatus: "VERIFIED", matchStatus: "MATCHED",
    } });
    await prisma.paymentAllocation.create({ data: {
      paymentEventId: event.id, orderId: order.id, amountVnd: amount, matchedAt,
    } });
  }
  // Inclusion is independently controlled by createdAt, paidAt, and matchedAt.
  await fixture(1, inside, inside, inside, 29000, "PAID");
  await fixture(2, before, inside, inside, 199000, "PAID");
  await fixture(3, inside, after, after, 29000, "PAID");
  await fixture(4, after, before, before, 29000, "PAID");
  await fixture(5, inside, inside, inside, 29000, "REFUNDED");

  const billing = await prepareAdminAggregateReport("billing", 7, now);
  assert.equal(billing.fromVn, "2026-10-18");
  assert.equal(billing.untilVn, "2026-10-24");
  assert.deepEqual(billing.rows.map((row, i) => Number(row[3]) - Number(baselineBilling.rows[i]![3])),
    [3, 2, 3, 257000]);
  assert.equal((await prepareAdminAggregateReport("billing", 7, new Date("2025-01-01T10:00Z")))
    .rows.every(row => row[3] === 0), true, "empty period should contain zero counts and sums");
  console.log("PASS: PostgreSQL created/paid/matched boundaries, refund gross disclosure, empty period");

  const vnDay = new Date("2026-10-24T00:00:00.000Z");
  await prisma.productUsageDaily.createMany({ data: [
    { userId: ids[0]!, dayVn: vnDay, pageViews: 2, firstSeenAt: now, lastSeenAt: now },
    { userId: ids[4]!, dayVn: vnDay, pageViews: 3, firstSeenAt: now, lastSeenAt: now },
  ] });
  const traffic = await prepareAdminAggregateReport("traffic", 7, now);
  assert.equal(traffic.rows.length, 7);
  assert.deepEqual(traffic.rows.at(-1), ["2026-10-24",
    Number(baselineTraffic.rows.at(-1)?.[1]) + 2,
    Number(baselineTraffic.rows.at(-1)?.[2]) + 5, "Asia/Ho_Chi_Minh"]);
  assert.deepEqual(traffic.rows.slice(0, -1), baselineTraffic.rows.slice(0, -1));
  console.log("PASS: PostgreSQL daily distinct users, empty days, Vietnamese reporting dates");

  const repairAt = new Date("2026-10-24T05:00:00Z");
  const repairDay = new Date("2026-10-23T00:00:00Z");
  await prisma.productPageviewReceipt.createMany({ data: [0, 1].map((_, index) => ({
    userId: ids[1]!, navigationId: randomUUID(), routeGroup: "REPORTS",
    createdAt: new Date(`2026-10-22T${index === 0 ? "18" : "20"}:00:00Z`),
  })) });
  assert.ok((await backfillUsageDaily(repairAt)) >= 1);
  assert.equal((await prisma.productUsageDaily.findUniqueOrThrow({
    where: { userId_dayVn: { userId: ids[1]!, dayVn: repairDay } },
  })).pageViews, 2, "missing daily rollup must be reconstructed from retained receipts");
  await recordAuthenticatedPageview(ids[1]!, randomUUID(), "REPORTS", new Date("2026-10-22T21:00:00Z"));
  assert.equal(await backfillUsageDaily(repairAt), 0, "repeat repair should avoid rewriting unchanged rollups");
  assert.equal((await prisma.productUsageDaily.findUniqueOrThrow({
    where: { userId_dayVn: { userId: ids[1]!, dayVn: repairDay } },
  })).pageViews, 3, "repair must never replace a higher live count");
  const cleaned = await pruneUsageAnalytics(repairAt);
  assert.equal(cleaned.backfilledDays, 0, "retention should not rewrite already repaired rollups");
  assert.equal((await prisma.productUsageDaily.findUniqueOrThrow({
    where: { userId_dayVn: { userId: ids[1]!, dayVn: repairDay } },
  })).pageViews, 3, "scheduled repair + retention must preserve live counts");
  console.log("PASS: missing daily rollup restored, repeat repair idempotent, live count preserved");

  // The two-day receipt cutoff is inclusive. Midnight Vietnam = 17:00 UTC.
  const boundaryReceipts = [
    "2026-10-22T04:59:59.999Z", // expired
    "2026-10-22T05:00:00.000Z", // retained, VN Oct 22
    "2026-10-22T16:59:59.999Z", // VN Oct 22
    "2026-10-22T17:00:00.000Z", // VN Oct 23
  ];
  await prisma.productPageviewReceipt.createMany({ data: boundaryReceipts.map(createdAt => ({
    userId: ids[3]!, navigationId: randomUUID(), routeGroup: "REPORTS", createdAt: new Date(createdAt),
  })) });
  assert.ok((await backfillUsageDaily(repairAt)) >= 2);
  for (const [day, views] of [["2026-10-22", 2], ["2026-10-23", 1]] as const) {
    const row = await prisma.productUsageDaily.findUniqueOrThrow({
      where: { userId_dayVn: { userId: ids[3]!, dayVn: new Date(`${day}T00:00:00Z`) } },
    });
    assert.equal(row.pageViews, views, `UTC-to-Vietnam boundary ${day}`);
  }

  // Competing repair workers must not override a higher live counter or move
  // lastSeenAt backwards when a delayed navigation is recorded.
  const concurrentDay = new Date("2026-10-24T00:00:00Z");
  await prisma.productPageviewReceipt.createMany({ data: ["04:00", "04:10"].map(time => ({
    userId: ids[2]!, navigationId: randomUUID(), routeGroup: "REPORTS",
    createdAt: new Date(`2026-10-24T${time}:00Z`),
  })) });
  await prisma.productUsageDaily.create({ data: {
    userId: ids[2]!, dayVn: concurrentDay, pageViews: 10,
    firstSeenAt: new Date("2026-10-24T03:00:00Z"), lastSeenAt: new Date("2026-10-24T04:55:00Z"),
  } });
  await Promise.all([
    backfillUsageDaily(repairAt), backfillUsageDaily(repairAt), backfillUsageDaily(repairAt),
    recordAuthenticatedPageview(ids[2]!, randomUUID(), "REPORTS", new Date("2026-10-24T04:20:00Z")),
  ]);
  const raced = await prisma.productUsageDaily.findUniqueOrThrow({
    where: { userId_dayVn: { userId: ids[2]!, dayVn: concurrentDay } },
  });
  assert.equal(raced.pageViews, 11, "parallel repairs must preserve the higher live count");
  assert.equal(raced.lastSeenAt.toISOString(), "2026-10-24T04:55:00.000Z", "late navigation must not regress lastSeenAt");
  assert.equal(await backfillUsageDaily(repairAt), 0, "restart/replay must be idempotent");

  // Retention removes expired receipts and days while retaining boundary rows.
  const currentDay = new Date("2026-10-24T00:00:00Z");
  const expiredDay = new Date(currentDay.getTime() - 401 * 86400000);
  const retainedDay = new Date(currentDay.getTime() - 400 * 86400000);
  await prisma.productUsageDaily.createMany({ data: [expiredDay, retainedDay].map(dayVn => ({
    userId: ids[4]!, dayVn, pageViews: 1, firstSeenAt: dayVn, lastSeenAt: dayVn,
  })) });
  const pruned = await pruneUsageAnalytics(repairAt);
  assert.ok(pruned.receipts >= 1, "expired receipt should be deleted");
  assert.ok(pruned.daily >= 1, "expired daily row should be deleted");
  assert.equal(await prisma.productPageviewReceipt.count({ where: {
    userId: ids[3]!, createdAt: new Date(boundaryReceipts[0]!),
  } }), 0);
  assert.equal(await prisma.productPageviewReceipt.count({ where: {
    userId: ids[3]!, createdAt: new Date(boundaryReceipts[1]!),
  } }), 1);
  assert.equal(await prisma.productUsageDaily.count({ where: { userId: ids[4]!, dayVn: expiredDay } }), 0);
  assert.equal(await prisma.productUsageDaily.count({ where: { userId: ids[4]!, dayVn: retainedDay } }), 1);
  assert.equal((await pruneUsageAnalytics(repairAt)).backfilledDays, 0);
  const indexed = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
      AND tablename IN ('ProductUsageDaily', 'ProductPageviewReceipt')`;
  assert.ok(indexed.some(row => row.indexname === "ProductUsageDaily_dayVn_idx"));
  assert.ok(indexed.some(row => row.indexname === "ProductPageviewReceipt_createdAt_idx"));
  console.log("PASS: concurrent workers/live increments, Vietnam midnight, inclusive receipt TTL, 400-day rollup retention, indexes");

  const context = await auth.$context;
  const signatures = await Promise.all(ids.map(async userId => {
    const token = randomUUID();
    await prisma.session.create({ data: {
      id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3600_000),
    } });
    const signature = createHmac("sha256", context.secret).update(token).digest("base64");
    return `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`;
  }));
  function request(cookie: string | undefined, kind: "billing" | "traffic", format: "csv" | "xlsx") {
    return new NextRequest(`http://localhost:3000/api/v1/admin/analytics/export?kind=${kind}&format=${format}&days=7`, {
      headers: cookie ? { cookie } : {},
    });
  }
  assert.equal((await GET(request(undefined, "billing", "csv"))).status, 401);
  assert.equal((await GET(request(signatures[4], "billing", "csv"))).status, 403);
  assert.equal((await GET(request(signatures[2], "traffic", "csv"))).status, 403);
  for (const i of [0, 1, 2, 3]) {
    const response = await GET(request(signatures[i], "billing", "csv"));
    assert.equal(response.status, 200, `${users[i]} may export aggregate billing`);
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    const csvBytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual(Array.from(csvBytes.slice(0, 3)), [239, 187, 191]);
    const csv = new TextDecoder().decode(csvBytes);
    assert.doesNotMatch(csv, new RegExp(marker), "personal and payment identifiers must be absent");
    assert.doesNotMatch(csv, /accountNumber|providerTransactionId|userId|orderCode/);
  }
  for (const i of [0, 1, 3]) {
    assert.equal((await GET(request(signatures[i], "traffic", "csv"))).status, 200);
  }
  const excel = await GET(request(signatures[0], "billing", "xlsx"));
  assert.equal(excel.status, 200);
  const book = new ExcelJS.Workbook();
  const content = Buffer.from(await excel.arrayBuffer());
  await book.xlsx.load(content as unknown as Parameters<typeof book.xlsx.load>[0]);
  assert.equal(book.worksheets[0]?.getRow(5).getCell(4).value,
    Number(baselineBilling.rows[3]?.[3]) + 257000);
  assert.equal(book.worksheets[0]?.rowCount, 5);
  assert.doesNotMatch(content.toString("latin1"), new RegExp(marker));
  console.log("PASS: actual Better Auth signed cookie, 401/403/200 role matrix, CSV/XLSX, private headers");
  console.log("PASS: Admin aggregate export PostgreSQL integration (QA fixture retained for audit)");
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
