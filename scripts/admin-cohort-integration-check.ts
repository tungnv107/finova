/** PostgreSQL QA only: signup cohorts across the Vietnam midnight boundary. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { getRegistrationCohorts } from "../src/modules/admin/cohorts";

async function main() {
  const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.slice(1);
  assert.match(dbName, /^finova_admin_test_[a-zA-Z0-9_]+$/, "isolated Admin QA database is required");
  const prefix = `qacohort_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const userIds = ["a", "b", "c", "d"].map(suffix => `${prefix}_${suffix}`);
  const now = new Date("2026-10-25T02:00:00.000Z");
  try {
    await prisma.user.createMany({ data: [
      { id: userIds[0], name: "QA cohort A", email: `${userIds[0]}@example.test`, createdAt: new Date("2026-10-23T16:59:59.999Z") },
      { id: userIds[1], name: "QA cohort B", email: `${userIds[1]}@example.test`, createdAt: new Date("2026-10-23T17:00:00.000Z") },
      { id: userIds[2], name: "QA cohort C", email: `${userIds[2]}@example.test`, createdAt: new Date("2026-10-18T12:00:00.000Z") },
      { id: userIds[3], name: "QA cohort D", email: `${userIds[3]}@example.test`, createdAt: new Date("2026-09-25T00:00:00.000Z") },
    ] });
    await prisma.productUsageDaily.createMany({ data: [
      { userId: userIds[0], dayVn: new Date("2026-10-23"), pageViews: 2, firstSeenAt: now, lastSeenAt: now },
      { userId: userIds[0], dayVn: new Date("2026-10-24"), pageViews: 1, firstSeenAt: now, lastSeenAt: now },
      { userId: userIds[1], dayVn: new Date("2026-10-24"), pageViews: 1, firstSeenAt: now, lastSeenAt: now },
      { userId: userIds[2], dayVn: new Date("2026-10-25"), pageViews: 1, firstSeenAt: now, lastSeenAt: now },
      { userId: userIds[3], dayVn: new Date("2026-10-25"), pageViews: 1, firstSeenAt: now, lastSeenAt: now },
    ] });
    const result = await getRegistrationCohorts(now);
    assert.equal(result.totalUsers, 4, "four real user rows");
    assert.equal(result.newUsers30d, 3, "the old September signup falls outside the 30-day window");
    assert.equal(result.activatedOnSignup, 2, "only A/B active on their VN signup date");
    assert.deepEqual(result.day1, { users: 4, returned: 1, rate: 0.25 });
    assert.deepEqual(result.day7, { users: 2, returned: 1, rate: 0.5 });
    assert.deepEqual(result.day30, { users: 1, returned: 1, rate: 1 });
    assert.equal(result.cohorts.find(row => row.day === "2026-10-23")?.signups, 1);
    assert.equal(result.cohorts.find(row => row.day === "2026-10-24")?.signups, 1);
    assert.equal(result.cohorts.at(-1)?.activeD1, null, "future-day activity excluded");
    const empty = await getRegistrationCohorts(new Date("2025-01-01T10:00:00.000Z"));
    assert.equal(empty.cohorts.reduce((sum, row) => sum + row.signups, 0), 0);
    assert.equal(empty.day7.rate, null);
    console.log("ADMIN_COHORT_QA_PASS: signup counts, D0/D1/D7/D30, Vietnam midnight, maturity and empty dates");
  } finally {
    await prisma.productUsageDaily.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
