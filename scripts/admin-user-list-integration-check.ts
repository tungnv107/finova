import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { exportAdminUsers, getAdminUser, listAdminUsers } from "../src/modules/admin/users";

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`ADMIN_USER_LIST_QA_FAILED: ${message}`);
}

async function main() {
  const name = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname.slice(1);
  check(/^finova_admin_test_[A-Za-z0-9_]+$/.test(name), "only isolated Admin QA databases are allowed");
  const token = randomUUID().replaceAll("-", "").slice(0, 16);
  const prefix = `qauser_${token}`;
  const ids = Array.from({ length: 65 }, (_, i) => `${prefix}_${String(i).padStart(3, "0")}`);
  const equalTimestamp = new Date("2026-10-24T08:00:00.000Z");
  const actor = { userId: `qaactor_${token}`, role: "SUPER_ADMIN" as const };
  const grantId = `qagrant_${token}`;
  try {
    await prisma.user.createMany({ data: ids.map((id, i) => ({
      id, name: `QA admin list ${prefix} #${i}`, email: `${id}@example.test`, createdAt: equalTimestamp,
    })) });
    await prisma.userAccessState.create({ data: { userId: ids[10], status: "SUSPENDED", reason: "QA fixture" } });
    await prisma.adminAuditLog.create({ data: { actorId: actor.userId, action: "USER_ACCESS_CHANGE",
      resourceType: "USER", resourceId: ids[10], afterJson: { status: "SUSPENDED", privateValue: "DO_NOT_LEAK" } } });
    await prisma.subscriptionGrant.create({ data: { id: grantId, userId: ids[1], grantType: "MANUAL",
      startsAt: new Date("2026-10-20T00:00:00.000Z"), expiresAt: new Date("2026-12-20T00:00:00.000Z") } });
    await prisma.subscriptionEvent.create({ data: { userId: ids[1], grantId, kind: "GRANT_ACTIVATED",
      startsAt: new Date("2026-10-20T00:00:00.000Z"), expiresAt: new Date("2026-12-20T00:00:00.000Z") } });
    await prisma.productUsageDaily.create({ data: { userId: ids[1], dayVn: new Date("2026-10-24T00:00:00.000Z"),
      pageViews: 1, firstSeenAt: new Date("2026-10-24T12:00:00.000Z"),
      lastSeenAt: new Date("2026-10-24T13:00:00.000Z") } });

    const filter = { q: prefix };
    const first = await listAdminUsers(filter);
    check(first.total === 65 && first.users.length === 30 && first.previousCursor === null && !!first.nextCursor,
      "first page and count");
    check(first.users.map(u => u.id).join() === ids.slice(0, 30).join(), "tie-break ascending ID");
    const second = await listAdminUsers({ ...filter, cursor: first.nextCursor! });
    const third = await listAdminUsers({ ...filter, cursor: second.nextCursor! });
    check(second.users.map(u => u.id).join() === ids.slice(30, 60).join(), "second page keyset");
    check(third.users.map(u => u.id).join() === ids.slice(60).join() && !third.nextCursor,
      "last page / no duplicate / no offset cutoff");
    const backward = await listAdminUsers({ ...filter, cursor: second.previousCursor! });
    check(backward.users.map(u => u.id).join() === first.users.map(u => u.id).join(),
      "reverse navigation preserves order");

    const active = await listAdminUsers({ ...filter, status: "ACTIVE" });
    const suspended = await listAdminUsers({ ...filter, status: "SUSPENDED" });
    check(active.total === 64 && suspended.total === 1 && suspended.users[0].id === ids[10],
      "active default + suspension filter");
    let mismatchedFilter = false;
    try { await listAdminUsers({ ...filter, status: "ACTIVE", cursor: first.nextCursor! }); }
    catch { mismatchedFilter = true; }
    check(mismatchedFilter, "filter-switch cursor rejected");

    const inserted = `${prefix}_015a`;
    await prisma.user.create({ data: { id: inserted, name: `QA admin list ${prefix} new`,
      email: `${inserted}@example.test`, createdAt: equalTimestamp } });
    const continued = await listAdminUsers({ ...filter, cursor: first.nextCursor! });
    check(continued.users.map(u => u.id).join() === second.users.map(u => u.id).join(),
      "concurrent insert ahead of cursor does not shift the next page");

    const detail = await getAdminUser(ids[1]);
    check(detail.plan === "PREMIUM" && detail.subscriptionEvents.length === 1 &&
      detail.lastSeenAt?.toISOString() === "2026-10-24T13:00:00.000Z",
      "user detail grant/event/last seen from real records");
    const sensitive = await getAdminUser(ids[10]);
    check(sensitive.accessEvents.length === 1 && sensitive.accessEvents[0].status === "SUSPENDED" &&
      !JSON.stringify(sensitive).includes("DO_NOT_LEAK"), "access lifecycle without audit PII");
    const csv = new TextDecoder().decode(await exportAdminUsers(actor, filter));
    check(csv.includes(ids[1]) && csv.includes("PREMIUM") && csv.includes("SUSPENDED") &&
      !csv.includes("DO_NOT_LEAK") && csv.split("\r\n").length === 68,
      "Super Admin bounded CSV projection and audit");
    const reportAudit = await prisma.adminAuditLog.findFirstOrThrow({ where: {
      actorId: actor.userId, action: "ADMIN_USERS_EXPORT",
    } });
    check(JSON.stringify(reportAudit.afterJson).includes('"count":66') &&
      !JSON.stringify(reportAudit).includes(`${ids[1]}@example.test`), "PII-free export audit");

    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'User'
        AND indexname = 'User_createdAt_id_idx'`;
    check(indexes.length === 1 && /"createdAt" DESC, (?:"id"|id)\b/.test(indexes[0].indexdef),
      "keyset composite index exists on PostgreSQL");
    console.log("ADMIN_USER_LIST_QA_PASS: 65 users, forward/backward keyset, equal timestamps, insert stability, filters, profile lifecycle, safe CSV, audit, index");
  } finally {
    // Scope cleanup to this run; never touch user-created test records.
    await prisma.subscriptionEvent.deleteMany({ where: { userId: { in: [...ids, `${prefix}_015a`] } } });
    await prisma.subscriptionGrant.deleteMany({ where: { userId: { in: [...ids, `${prefix}_015a`] } } });
    await prisma.productUsageDaily.deleteMany({ where: { userId: { in: [...ids, `${prefix}_015a`] } } });
    await prisma.userAccessState.deleteMany({ where: { userId: { in: [...ids, `${prefix}_015a`] } } });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: actor.userId } });
    await prisma.user.deleteMany({ where: { id: { in: [...ids, `${prefix}_015a`] } } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
