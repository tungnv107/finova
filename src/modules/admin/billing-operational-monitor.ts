import { prisma } from "@/lib/db";
import { HttpError } from "@/server/context";
import { serializable } from "@/server/serializable";
import type { SystemActor } from "@/server/system-auth";
import { getBillingOperationalAlerts, type BillingOperationalAlert } from "./billing-operational-alerts";

const providerProbeId = "BILLING_PROVIDER";
const escalationMs = 30 * 60_000;
export const billingOperationalMonitorEnabled = () => process.env.FINOVA_BILLING_ALERTS_ENABLED === "1";

/** This is an independent configured health endpoint, not an IPN counter.
 * A failed HTTP request is a probe failure; it does not prove banking downtime.
 * Never interpolate customer-supplied URLs or follow redirects.
 */
export async function sampleBillingProviderHealth(): Promise<"HEALTHY" | "UNREACHABLE" | null> {
  const configured = process.env.FINOVA_BILLING_PROVIDER_HEALTH_URL?.trim();
  if (!configured) return null;
  const url = new URL(configured);
  if (url.protocol !== "https:" || !(/(^|\.)sepay\.vn$/i).test(url.hostname) ||
    url.username || url.password || url.port) throw new Error("INVALID_PROVIDER_HEALTH_CONFIG");
  try {
    const response = await fetch(url, {
      method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4500),
      headers: { Accept: "application/json" },
    });
    return response.ok ? "HEALTHY" : "UNREACHABLE";
  } catch {
    return "UNREACHABLE";
  }
}

type OperationalSweepResult = {
  checkedAt: Date; opened: number; resolved: number; escalated: number;
  delivered: number; skipped: boolean; recipientGaps: number;
};

/** Scheduler writes an in-app delivery for each eligible operator exactly once per
 * incident generation. Transaction-scoped PG lock serializes overlapping cron runs.
 */
export async function runBillingOperationalSweep(now = new Date()): Promise<OperationalSweepResult> {
  if (!billingOperationalMonitorEnabled()) throw new HttpError(404, "ALERT_MONITOR_DISABLED", "Chưa bật giám sát.");
  // Keep the external HTTPS request outside the database transaction. Read
  // financial signals only after acquiring the lock, in the same snapshot as
  // the incident writes, so overlapping schedulers cannot commit stale data.
  const providerStatus = await sampleBillingProviderHealth();
  return serializable(async db => {
    const [lock] = await db.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(731204, 508) AS locked`;
    const result: OperationalSweepResult = { checkedAt: now, opened: 0, resolved: 0, escalated: 0,
      delivered: 0, skipped: false, recipientGaps: 0 };
    if (!lock?.locked) return { ...result, skipped: true };

    const snapshot = await getBillingOperationalAlerts(now, db);
    const alerts = [...snapshot.alerts];
    if (providerStatus) {
      const previous = await db.billingProviderProbe.findUnique({ where: { id: providerProbeId } });
      const failures = providerStatus === "HEALTHY" ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
      await db.billingProviderProbe.upsert({
        where: { id: providerProbeId },
        create: { id: providerProbeId, status: providerStatus, consecutiveFailures: failures,
          checkedAt: now, lastSuccessAt: providerStatus === "HEALTHY" ? now : null },
        update: { status: providerStatus, consecutiveFailures: failures, checkedAt: now,
          ...(providerStatus === "HEALTHY" ? { lastSuccessAt: now } : {}) },
      });
      if (failures >= 3) alerts.push({
        code: "PROVIDER_PROBE_FAILURE", severity: "warning", count: failures,
        title: "Kiểm tra trạng thái provider thất bại",
        explanation: "Điểm kiểm tra HTTPS độc lập không phản hồi tốt qua ít nhất 3 lần chạy. Kiểm tra kết nối và xác nhận trực tiếp với provider; chưa đủ chứng cứ kết luận mất IPN.",
        href: "/admin/billing/payments?review=1",
      });
    }
    const assignments = await db.systemRoleAssignment.findMany({
      where: { revokedAt: null, role: { in: ["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"] } },
      select: { userId: true, role: true, user: { select: { accessState: { select: { status: true } } } } },
    });
    const forRoles = (roles: string[]) => [...new Set(assignments.filter(a =>
      roles.includes(a.role) && (!a.user.accessState || a.user.accessState.status === "ACTIVE")
    ).map(a => a.userId))];
    const eligible = (alert: BillingOperationalAlert) => forRoles(
      alert.severity === "critical" ? ["FINANCE_OPERATOR", "ADMIN"] : ["FINANCE_OPERATOR"]);
    const active = await db.billingOperationalIncident.findMany({ where: { state: { not: "RESOLVED" } } });
    const activeMap = new Map(active.map(item => [item.code, item]));
    const currentCodes = new Set(alerts.map(a => a.code));
    for (const incident of active) {
      if (currentCodes.has(incident.code)) continue;
      await db.billingOperationalIncident.update({ where: { id: incident.id },
        data: { state: "RESOLVED", resolvedAt: now, observedAt: now } });
      await db.billingOperationalRelay.updateMany({ where: { incidentId: incident.id, state: "PENDING" },
        data: { state: "CANCELLED", leaseOwner: null, leaseUntil: null } });
      await db.billingOperationalHistory.create({ data: {
        incidentId: incident.id, generation: incident.generation, action: "RESOLVED", at: now,
      } });
      result.resolved++;
    }
    for (const alert of alerts) {
      let incident = activeMap.get(alert.code);
      if (!incident) {
        const previous = await db.billingOperationalIncident.findUnique({ where: { code: alert.code } });
        incident = previous ? await db.billingOperationalIncident.update({
          where: { id: previous.id },
          data: { severity: alert.severity, title: alert.title, explanation: alert.explanation,
            href: alert.href, count: alert.count, state: "OPEN", generation: { increment: 1 },
            openedAt: now, observedAt: now, acknowledgedAt: null, acknowledgedBy: null,
            resolvedAt: null, escalatedAt: null },
        }) : await db.billingOperationalIncident.create({
          data: { code: alert.code, severity: alert.severity, title: alert.title,
            explanation: alert.explanation, href: alert.href, count: alert.count, openedAt: now, observedAt: now },
        });
        await db.billingOperationalHistory.create({ data: { incidentId: incident.id,
          generation: incident.generation, action: previous ? "REOPENED" : "OPENED", at: now } });
        result.opened++;
      } else {
        await db.billingOperationalIncident.update({ where: { id: incident.id },
          data: { count: alert.count, observedAt: now, severity: alert.severity } });
      }
      // A role may be assigned after an incident opened without recipients.
      // Reconcile every sweep; unique keys make repeated scans idempotent.
      let recipients = eligible(alert);
      const fallback = recipients.length === 0;
      if (fallback) recipients = forRoles(["SUPER_ADMIN"]);
      if (recipients.length === 0) result.recipientGaps++;
      if (recipients.length) {
        const delivered = await db.billingOperationalDelivery.createMany({
          data: recipients.map(userId => ({ incidentId: incident.id, generation: incident.generation,
            userId, deliveredAt: now })), skipDuplicates: true,
        });
        result.delivered += delivered.count;
        await db.billingOperationalRelay.createMany({ data: [{
          incidentId: incident.id, generation: incident.generation, phase: "PRIMARY",
          audience: fallback ? "SUPER_ADMIN" : alert.severity === "critical" ?
            "FINANCE_OPERATOR,ADMIN" : "FINANCE_OPERATOR",
          nextAttemptAt: now,
        }], skipDuplicates: true });
      }
      if (incident.state === "OPEN" && !incident.escalatedAt &&
        now.getTime() - incident.openedAt.getTime() >= escalationMs) {
        const managers = forRoles(["SUPER_ADMIN"]);
        if (managers.length) {
          const delivery = await db.billingOperationalDelivery.createMany({
            data: managers.map(userId => ({ incidentId: incident.id, generation: incident.generation,
              userId, deliveredAt: now })), skipDuplicates: true,
          });
          result.delivered += delivery.count;
          await db.billingOperationalRelay.create({ data: {
            incidentId: incident.id, generation: incident.generation,
            phase: "ESCALATION", audience: "SUPER_ADMIN", nextAttemptAt: now,
          } });
          await db.billingOperationalIncident.update({ where: { id: incident.id }, data: { escalatedAt: now } });
          await db.billingOperationalHistory.create({ data: {
            incidentId: incident.id, generation: incident.generation, action: "ESCALATED", at: now,
          } });
          result.escalated++;
        } else result.recipientGaps++;
      }
    }
    return result;
  });
}

/** Operators see only their own durable deliveries, plus Super Admin oversight. */
export async function getOperatorBillingIncidents(actor: SystemActor) {
  const fields = { id: true, code: true, severity: true, count: true, title: true, explanation: true,
    href: true, state: true, openedAt: true, observedAt: true, acknowledgedAt: true,
    escalatedAt: true, generation: true } as const;
  if (actor.role !== "SUPER_ADMIN") {
    const delivered = await prisma.billingOperationalDelivery.findMany({
      where: { userId: actor.userId }, orderBy: { deliveredAt: "desc" }, take: 100,
      select: { generation: true, incident: { select: fields } },
    });
    // A user can retain a historical delivery after Finance is revoked and
    // another role is granted. ADMIN may act only on critical alerts; a
    // warning originally delivered to that user as Finance must not leak.
    const current = delivered.filter(row => row.generation === row.incident.generation &&
      (actor.role !== "ADMIN" || row.incident.severity === "critical"))
      .map(row => row.incident).sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
    return current.slice(0, 40);
  }
  return prisma.billingOperationalIncident.findMany({
    orderBy: [{ observedAt: "desc" }, { code: "asc" }], take: 40,
    select: fields,
  });
}

export async function acknowledgeBillingOperationalIncident(actor: SystemActor, id: string, now = new Date()) {
  return serializable(async db => {
    const incident = await db.billingOperationalIncident.findUnique({ where: { id } });
    if (!incident || incident.state === "RESOLVED") {
      throw new HttpError(404, "INCIDENT_NOT_ACTIVE", "Không tìm thấy sự cố đang mở.");
    }
    if (actor.role === "ADMIN" && incident.severity !== "critical") {
      throw new HttpError(403, "INCIDENT_NOT_ASSIGNED", "Sự cố không được giao cho vai trò hiện tại.");
    }
    if (actor.role !== "SUPER_ADMIN") {
      const delivery = await db.billingOperationalDelivery.findUnique({
        where: { incidentId_generation_userId: {
          incidentId: id, generation: incident.generation, userId: actor.userId,
        } },
      });
      if (!delivery) throw new HttpError(403, "INCIDENT_NOT_ASSIGNED", "Sự cố không được giao cho tài khoản này.");
    }
    if (incident.state === "ACKNOWLEDGED") return { id, state: "ACKNOWLEDGED" as const, changed: false };
    await db.billingOperationalIncident.update({ where: { id }, data: {
      state: "ACKNOWLEDGED", acknowledgedAt: now, acknowledgedBy: actor.userId,
    } });
    await db.billingOperationalHistory.create({ data: {
      incidentId: id, generation: incident.generation, action: "ACKNOWLEDGED", actorId: actor.userId, at: now,
    } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId,
      action: "BILLING_INCIDENT_ACK", resourceType: "BILLING_OPERATIONAL_INCIDENT", resourceId: id,
      afterJson: { code: incident.code, generation: incident.generation, state: "ACKNOWLEDGED" } } });
    return { id, state: "ACKNOWLEDGED" as const, changed: true };
  });
}
