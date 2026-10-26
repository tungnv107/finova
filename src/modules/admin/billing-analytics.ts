import { prisma } from "@/lib/db";
import { adminExportPeriod, type AdminExportDays } from "./analytics-export";

type CountRow = { day: Date; created: bigint; paidCohort: bigint; activated: bigint; monthly: bigint; yearly: bigint; refunded: bigint };
type GrantRow = { day: Date; paidGrants: bigint; renewals: bigint; expiredUsers: bigint; monthlyGrants: bigint; yearlyGrants: bigint };
type CashRow = { day: Date; allocatedCount: bigint; grossVnd: string };
type ExceptionRow = { day: Date; verified: bigint; exceptions: bigint; unresolved: bigint; reviewIncomingCount: bigint; reviewIncomingVnd: string };
type UniquePaidRow = { paidUsers: bigint; firstPaidUsers: bigint; renewingUsers: bigint };

/** Cash is gross allocations, not revenue or refund-adjusted cash. The current schema
 * has no refund transaction ledger/timestamp, so refunded orders belong to their
 * creation cohort and cannot be presented as cash returned in this period.
 */
export async function getBillingAnalytics(days: AdminExportDays, now = new Date()) {
  const period = adminExportPeriod(days, now);
  const start = period.startUtc;
  const end = period.endUtc;
  const [orders, grants, cash, exceptions, uniquePaid] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
        COUNT(*)::bigint AS created,
        COUNT(*) FILTER (WHERE "paidAt" IS NOT NULL)::bigint AS "paidCohort",
        COUNT(*) FILTER (WHERE "paidAt" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "SubscriptionGrant" g WHERE g."orderId" = o.id
        ))::bigint AS activated,
        COUNT(*) FILTER (WHERE "billingPeriodSnapshot" = 'MONTH')::bigint AS monthly,
        COUNT(*) FILTER (WHERE "billingPeriodSnapshot" = 'YEAR')::bigint AS yearly,
        COUNT(*) FILTER (WHERE "status" = 'REFUNDED')::bigint AS refunded
      FROM "BillingOrder" o WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY day ORDER BY day`,
    prisma.$queryRaw<GrantRow[]>`
      WITH paid AS (
        SELECT g.id, g."userId", g."createdAt", g."billingPeriod",
          (g."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
          EXISTS (SELECT 1 FROM "SubscriptionGrant" previous
            WHERE previous."userId" = g."userId" AND previous."grantType" = 'BANK_PAYMENT'
              AND (previous."createdAt", previous.id) < (g."createdAt", g.id)) AS renewal
        FROM "SubscriptionGrant" g
        WHERE g."grantType" = 'BANK_PAYMENT' AND g."orderId" IS NOT NULL
          AND g."createdAt" >= ${start} AND g."createdAt" < ${end}
      ), expired AS (
        SELECT DISTINCT g."userId",
          (g."expiresAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day
        FROM "SubscriptionGrant" g WHERE g."revokedAt" IS NULL
          AND g."expiresAt" >= ${start} AND g."expiresAt" < ${end}
          AND NOT EXISTS (SELECT 1 FROM "SubscriptionGrant" other
            WHERE other."userId" = g."userId" AND other.id <> g.id
              AND other."revokedAt" IS NULL
              AND other."startsAt" <= g."expiresAt" AND other."expiresAt" > g."expiresAt")
      )
      SELECT days.day,
        COALESCE((SELECT COUNT(*) FROM paid WHERE paid.day = days.day), 0)::bigint AS "paidGrants",
        COALESCE((SELECT COUNT(*) FROM paid WHERE paid.day = days.day AND paid.renewal), 0)::bigint AS renewals,
        COALESCE((SELECT COUNT(*) FROM paid WHERE paid.day = days.day
          AND paid."billingPeriod" = 'MONTH'), 0)::bigint AS "monthlyGrants",
        COALESCE((SELECT COUNT(*) FROM paid WHERE paid.day = days.day
          AND paid."billingPeriod" = 'YEAR'), 0)::bigint AS "yearlyGrants",
        COALESCE((SELECT COUNT(*) FROM expired WHERE expired.day = days.day), 0)::bigint AS "expiredUsers"
      FROM (SELECT day FROM paid UNION SELECT day FROM expired) days ORDER BY days.day`,
    prisma.$queryRaw<CashRow[]>`
      SELECT (a."matchedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
        COUNT(*)::bigint AS "allocatedCount", SUM(a."amountVnd")::text AS "grossVnd"
      FROM "PaymentAllocation" a
      WHERE a."matchedAt" >= ${start} AND a."matchedAt" < ${end}
      GROUP BY day ORDER BY day`,
    prisma.$queryRaw<ExceptionRow[]>`
      SELECT ("receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
        COUNT(*) FILTER (WHERE "verificationStatus" = 'VERIFIED')::bigint AS verified,
        COUNT(*) FILTER (WHERE "matchStatus" NOT IN ('MATCHED', 'RECEIVED'))::bigint AS exceptions,
        COUNT(*) FILTER (WHERE "verificationStatus" = 'VERIFIED' AND "matchStatus" <> 'MATCHED')::bigint AS unresolved,
        COUNT(*) FILTER (WHERE "verificationStatus" = 'VERIFIED' AND "matchStatus" <> 'MATCHED' AND direction = 'IN')::bigint AS "reviewIncomingCount",
        COALESCE(SUM("amountVnd") FILTER (WHERE "verificationStatus" = 'VERIFIED'
          AND "matchStatus" <> 'MATCHED' AND direction = 'IN'), 0)::text AS "reviewIncomingVnd"
      FROM "BillingPaymentEvent"
      WHERE "receivedAt" >= ${start} AND "receivedAt" < ${end}
      GROUP BY day ORDER BY day`,
    prisma.$queryRaw<UniquePaidRow[]>`
      WITH in_period AS (
        SELECT g."userId",
          NOT EXISTS (SELECT 1 FROM "SubscriptionGrant" prior
            WHERE prior."userId" = g."userId" AND prior."grantType" = 'BANK_PAYMENT'
              AND (prior."createdAt", prior.id) < (g."createdAt", g.id)) AS first_paid,
          EXISTS (SELECT 1 FROM "SubscriptionGrant" prior
            WHERE prior."userId" = g."userId" AND prior."grantType" = 'BANK_PAYMENT'
              AND (prior."createdAt", prior.id) < (g."createdAt", g.id)) AS renewal
        FROM "SubscriptionGrant" g
        WHERE g."grantType" = 'BANK_PAYMENT' AND g."orderId" IS NOT NULL
          AND g."createdAt" >= ${start} AND g."createdAt" < ${end}
      )
      SELECT COUNT(DISTINCT "userId")::bigint AS "paidUsers",
        COUNT(DISTINCT "userId") FILTER (WHERE first_paid)::bigint AS "firstPaidUsers",
        COUNT(DISTINCT "userId") FILTER (WHERE renewal)::bigint AS "renewingUsers"
      FROM in_period`,
  ]);
  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const indexed = <T extends { day: Date }>(rows: T[]) => new Map(rows.map(row => [dayKey(row.day), row]));
  const o = indexed(orders), g = indexed(grants), c = indexed(cash), e = indexed(exceptions);
  const rows = Array.from({ length: days }, (_, offset) => {
    const day = new Date(period.startUtc.getTime() + 7 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
    const order = o.get(day), grant = g.get(day), allocation = c.get(day), payment = e.get(day);
    return {
      day,
      orders: Number(order?.created ?? BigInt(0)), paidFromOrders: Number(order?.paidCohort ?? BigInt(0)),
      activatedFromOrders: Number(order?.activated ?? BigInt(0)),
      monthlyOrders: Number(order?.monthly ?? BigInt(0)), yearlyOrders: Number(order?.yearly ?? BigInt(0)),
      refundedOrderCohort: Number(order?.refunded ?? BigInt(0)),
      paidGrants: Number(grant?.paidGrants ?? BigInt(0)), renewals: Number(grant?.renewals ?? BigInt(0)),
      monthlyGrants: Number(grant?.monthlyGrants ?? BigInt(0)), yearlyGrants: Number(grant?.yearlyGrants ?? BigInt(0)),
      expiredUsers: Number(grant?.expiredUsers ?? BigInt(0)),
      allocatedCount: Number(allocation?.allocatedCount ?? BigInt(0)), grossVnd: allocation?.grossVnd ?? "0",
      verifiedEvents: Number(payment?.verified ?? BigInt(0)), exceptions: Number(payment?.exceptions ?? BigInt(0)),
      unresolvedEvents: Number(payment?.unresolved ?? BigInt(0)),
      reviewIncomingCount: Number(payment?.reviewIncomingCount ?? BigInt(0)),
      reviewIncomingVnd: payment?.reviewIncomingVnd ?? "0",
    };
  });
  const total = (key: keyof typeof rows[number]) => rows.reduce((sum, row) => sum + Number(row[key]), 0);
  const grossVnd = rows.reduce((sum, row) => sum + BigInt(row.grossVnd), BigInt(0)).toString();
  const reviewIncomingVnd = rows.reduce((sum, row) => sum + BigInt(row.reviewIncomingVnd), BigInt(0)).toString();
  return {
    days, fromVn: period.fromVn, untilVn: period.untilVn, rows,
    totals: {
      orders: total("orders"), paidFromOrders: total("paidFromOrders"), activatedFromOrders: total("activatedFromOrders"),
      monthlyOrders: total("monthlyOrders"), yearlyOrders: total("yearlyOrders"),
      refundedOrderCohort: total("refundedOrderCohort"), paidGrants: total("paidGrants"),
      renewals: total("renewals"), expiredUsers: total("expiredUsers"),
      monthlyGrants: total("monthlyGrants"), yearlyGrants: total("yearlyGrants"),
      paidUsers: Number(uniquePaid[0]?.paidUsers ?? BigInt(0)),
      firstPaidUsers: Number(uniquePaid[0]?.firstPaidUsers ?? BigInt(0)),
      renewingUsers: Number(uniquePaid[0]?.renewingUsers ?? BigInt(0)),
      allocatedCount: total("allocatedCount"), grossVnd,
      verifiedEvents: total("verifiedEvents"), exceptions: total("exceptions"),
      unresolvedEvents: total("unresolvedEvents"),
      reviewIncomingCount: total("reviewIncomingCount"), reviewIncomingVnd,
      createdToPaidRate: total("orders") ? total("paidFromOrders") / total("orders") : null,
      createdToActivatedRate: total("orders") ? total("activatedFromOrders") / total("orders") : null,
    },
  };
}
