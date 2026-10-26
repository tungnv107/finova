import { prisma } from "@/lib/db";
import type { SystemRole } from "@finova/prisma";
import { getUsageKpis, usageAnalyticsEnabled } from "./usage";

export async function getAdminOverview(role: SystemRole) {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86400000);
  const [pendingOrders, totalOrders, paidOrders, paidValue] = await Promise.all([
    prisma.billingOrder.count({ where: { status: "PENDING_PAYMENT" } }),
    prisma.billingOrder.count(),
    prisma.billingOrder.count({ where: { status: "PAID" } }),
    prisma.paymentAllocation.aggregate({ _sum: { amountVnd: true } }),
  ]);
  const billing = { pendingOrders, totalOrders, paidOrders,
    collectedVnd: Number(paidValue._sum.amountVnd ?? 0) };
  if (role === "FINANCE_OPERATOR") return { scope: "FINANCE" as const, ...billing };
  const [totalUsers, newUsers30d, premiumUsers, superAdminIds] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { createdAt: { gte: start } } }),
    prisma.subscriptionGrant.groupBy({ by: ["userId"], where: { startsAt: { lte: now }, expiresAt: { gt: now }, revokedAt: null } }),
    prisma.systemRoleAssignment.findMany({ where: { role: "SUPER_ADMIN", revokedAt: null }, select: { userId: true } }),
  ]);
  const premiumCount = new Set([...premiumUsers.map(u => u.userId), ...superAdminIds.map(u => u.userId)]).size;
  const traffic = usageAnalyticsEnabled() ? await getUsageKpis(now) :
    { status: "NOT_INSTRUMENTED" as const, visits: null, dau: null, mau: null };
  return { scope: "OVERVIEW" as const, ...billing, totalUsers, newUsers30d,
    liteUsers: Math.max(0, totalUsers - premiumCount), premiumUsers: premiumCount,
    traffic };
}
