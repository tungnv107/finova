import { prisma } from "@/lib/db";
import { vietnamUsageDay } from "./usage-domain";

const DAY_MS = 86400000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

type CohortRow = {
  cohortDay: Date;
  signups: number;
  activeD0: number;
  activeD1: number;
  activeD7: number;
  activeD30: number;
};

/** Registration cohorts use a user's Vietnam-local signup date as day zero.
 * Activity is counted only when ProductUsageDaily has a row for the exact day.
 * Admin-only aggregates contain no user IDs or financial information.
 */
export async function getRegistrationCohorts(now = new Date()) {
  const today = vietnamUsageDay(now);
  const start = new Date(today.getTime() - 89 * DAY_MS);
  const startUtc = new Date(start.getTime() - VN_OFFSET_MS);
  const endUtc = new Date(today.getTime() + DAY_MS - VN_OFFSET_MS);
  const [totalUsers, rows] = await Promise.all([
    prisma.user.count(),
    prisma.$queryRaw<CohortRow[]>`
      WITH signup AS (
        SELECT id, ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS cohort_day
        FROM "User"
        WHERE "createdAt" >= ${startUtc} AND "createdAt" < ${endUtc}
      ), activity AS (
        SELECT s.cohort_day,
          EXISTS (SELECT 1 FROM "ProductUsageDaily" d WHERE d."userId" = s.id AND d."dayVn" = s.cohort_day) AS d0,
          EXISTS (SELECT 1 FROM "ProductUsageDaily" d WHERE d."userId" = s.id AND d."dayVn" = s.cohort_day + 1) AS d1,
          EXISTS (SELECT 1 FROM "ProductUsageDaily" d WHERE d."userId" = s.id AND d."dayVn" = s.cohort_day + 7) AS d7,
          EXISTS (SELECT 1 FROM "ProductUsageDaily" d WHERE d."userId" = s.id AND d."dayVn" = s.cohort_day + 30) AS d30
        FROM signup s
      )
      SELECT cohort_day AS "cohortDay", COUNT(*)::int AS signups,
        COUNT(*) FILTER (WHERE d0)::int AS "activeD0",
        COUNT(*) FILTER (WHERE d1)::int AS "activeD1",
        COUNT(*) FILTER (WHERE d7)::int AS "activeD7",
        COUNT(*) FILTER (WHERE d30)::int AS "activeD30"
      FROM activity GROUP BY cohort_day ORDER BY cohort_day ASC`,
  ]);
  const recorded = new Map(rows.map(row => [row.cohortDay.toISOString().slice(0, 10), row]));
  const cohorts = Array.from({ length: 90 }, (_, i) => {
    const time = start.getTime() + i * DAY_MS;
    const day = new Date(time).toISOString().slice(0, 10);
    const row = recorded.get(day);
    const age = Math.round((today.getTime() - time) / DAY_MS);
    return {
      day, signups: row?.signups ?? 0, activeD0: row?.activeD0 ?? 0,
      activeD1: age >= 1 ? row?.activeD1 ?? 0 : null,
      activeD7: age >= 7 ? row?.activeD7 ?? 0 : null,
      activeD30: age >= 30 ? row?.activeD30 ?? 0 : null,
    };
  });
  function retention(key: "activeD1" | "activeD7" | "activeD30") {
    const eligible = cohorts.filter(day => day[key] !== null);
    const users = eligible.reduce((sum, day) => sum + day.signups, 0);
    const returned = eligible.reduce((sum, day) => sum + (day[key] ?? 0), 0);
    return { users, returned, rate: users ? returned / users : null };
  }
  return {
    totalUsers,
    newUsers30d: cohorts.slice(-30).reduce((sum, day) => sum + day.signups, 0),
    activatedOnSignup: cohorts.reduce((sum, day) => sum + day.activeD0, 0),
    day1: retention("activeD1"), day7: retention("activeD7"), day30: retention("activeD30"),
    cohorts,
  };
}
