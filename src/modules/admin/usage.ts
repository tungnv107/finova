import { prisma } from "@/lib/db";
import { serializable } from "@/server/serializable";
import { vietnamUsageDay, type UsageRouteGroup } from "./usage-domain";

export const usageAnalyticsEnabled = () => process.env.FINOVA_USAGE_ANALYTICS_ENABLED === "1";

/** Signed-user pageview: one idempotency receipt + one daily increment in a DB transaction. */
export async function recordAuthenticatedPageview(userId: string, navigationId: string, routeGroup: UsageRouteGroup, now = new Date()) {
  if (!usageAnalyticsEnabled()) return { counted: false, disabled: true };
  const dayVn = vietnamUsageDay(now);
  const inserted = await serializable(async db => {
    const receipt = await db.productPageviewReceipt.createMany({ data: {
      userId, navigationId, routeGroup, createdAt: now,
    }, skipDuplicates: true });
    if (!receipt.count) return false;
    // Keep the observation range monotonic when concurrent or delayed events
    // arrive out of timestamp order. Receipt + counter remain one transaction.
    await db.$executeRaw`
      INSERT INTO "ProductUsageDaily" ("userId", "dayVn", "pageViews", "firstSeenAt", "lastSeenAt")
      VALUES (${userId}, ${dayVn}::date, 1, ${now}, ${now})
      ON CONFLICT ("userId", "dayVn") DO UPDATE SET
        "pageViews" = "ProductUsageDaily"."pageViews" + 1,
        "firstSeenAt" = LEAST("ProductUsageDaily"."firstSeenAt", EXCLUDED."firstSeenAt"),
        "lastSeenAt" = GREATEST("ProductUsageDaily"."lastSeenAt", EXCLUDED."lastSeenAt")`;
    return true;
  });
  return { counted: inserted, disabled: false };
}

/** Aggregates only. Distinct counts are based on the Vietnam calendar date. */
export async function getUsageKpis(now = new Date()) {
  const today = vietnamUsageDay(now);
  const monthStart = new Date(today.getTime() - 29 * 86400000);
  const weekStart = new Date(today.getTime() - 6 * 86400000);
  const ninetyDayStart = new Date(today.getTime() - 89 * 86400000);
  const [dau, activeRows, series] = await Promise.all([
    prisma.productUsageDaily.count({ where: { dayVn: today } }),
    prisma.$queryRaw<Array<{ wau: bigint; mau: bigint }>>`
      SELECT COUNT(DISTINCT CASE WHEN "dayVn" >= ${weekStart}::date THEN "userId" END) AS wau,
             COUNT(DISTINCT CASE WHEN "dayVn" >= ${monthStart}::date THEN "userId" END) AS mau
      FROM "ProductUsageDaily" WHERE "dayVn" BETWEEN ${ninetyDayStart}::date AND ${today}::date`,
    prisma.productUsageDaily.groupBy({ by: ["dayVn"], where: { dayVn: { gte: ninetyDayStart, lte: today } },
      _sum: { pageViews: true }, _count: { _all: true }, orderBy: { dayVn: "asc" } }),
  ]);
  const byDay = new Map(series.map(row => [row.dayVn.toISOString().slice(0, 10), row]));
  const trends = Array.from({ length: 90 }, (_, offset) => {
    const day = new Date(ninetyDayStart.getTime() + offset * 86400000).toISOString().slice(0, 10);
    const row = byDay.get(day);
    return { day, pageViews: row?._sum.pageViews ?? 0, activeUsers: row?._count._all ?? 0 };
  });
  const totalViews = (days: number) => trends.slice(-days).reduce((total, day) => total + day.pageViews, 0);
  return {
    status: "ACTIVE" as const, dau,
    wau: Number(activeRows[0]?.wau ?? BigInt(0)), mau: Number(activeRows[0]?.mau ?? BigInt(0)),
    pageViews7d: totalViews(7), pageViews30d: totalViews(30), pageViews90d: totalViews(90),
    days: trends.slice(-7), trends,
  };
}

/** Repair at most the retained two-day receipt window after a job interruption.
 * GREATEST avoids reducing a live pageview count if an upsert races with repair.
 * Receipts older than retention cannot be reconstructed; longer history is immutable.
 */
export async function backfillUsageDaily(now = new Date()) {
  const cutoff = new Date(now.getTime() - 2 * 86400000);
  const rows = await prisma.$queryRaw<Array<{ touched: number }>>`
    WITH grouped AS (
      SELECT "userId",
        -- Prisma stores a UTC instant in timestamp(3) WITHOUT time zone.
        -- Interpret it as UTC before deriving the Vietnam calendar day.
        ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day_vn,
        COUNT(*)::int AS views, MIN("createdAt") AS first_seen, MAX("createdAt") AS last_seen
      FROM "ProductPageviewReceipt"
      WHERE "createdAt" >= ${cutoff} AND "createdAt" <= ${now}
      GROUP BY "userId", day_vn
    ), repaired AS (
      INSERT INTO "ProductUsageDaily" ("userId", "dayVn", "pageViews", "firstSeenAt", "lastSeenAt")
      SELECT "userId", day_vn, views, first_seen, last_seen FROM grouped
      ON CONFLICT ("userId", "dayVn") DO UPDATE SET
        "pageViews" = GREATEST("ProductUsageDaily"."pageViews", EXCLUDED."pageViews"),
        "firstSeenAt" = LEAST("ProductUsageDaily"."firstSeenAt", EXCLUDED."firstSeenAt"),
        "lastSeenAt" = GREATEST("ProductUsageDaily"."lastSeenAt", EXCLUDED."lastSeenAt")
      WHERE "ProductUsageDaily"."pageViews" < EXCLUDED."pageViews"
         OR "ProductUsageDaily"."firstSeenAt" > EXCLUDED."firstSeenAt"
         OR "ProductUsageDaily"."lastSeenAt" < EXCLUDED."lastSeenAt"
      RETURNING 1
    )
    SELECT COUNT(*)::int AS touched FROM repaired`;
  return rows[0]?.touched ?? 0;
}

/** Run from a scheduled internal job: short dedup retention and bounded summary history. */
export async function pruneUsageAnalytics(now = new Date()) {
  // Backfill while short-lived receipts still exist, then enforce retention.
  const backfilledDays = await backfillUsageDaily(now);
  const [receipts, daily] = await Promise.all([
    prisma.productPageviewReceipt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 2 * 86400000) } } }),
    prisma.productUsageDaily.deleteMany({ where: { dayVn: { lt: new Date(vietnamUsageDay(now).getTime() - 400 * 86400000) } } }),
  ]);
  return { backfilledDays, receipts: receipts.count, daily: daily.count };
}
