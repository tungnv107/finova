import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

const maximumAttempts = 6;
const leaseMs = 2 * 60_000;
export const operationalRelayRetryMs = (attempt: number) =>
  Math.min(30 * 60_000, 15_000 * 2 ** Math.max(0, Math.min(attempt - 1, 10)));

export function operationalRelayConfig() {
  const target = process.env.FINOVA_BILLING_ALERT_RELAY_URL?.trim() ?? "";
  const secret = process.env.FINOVA_BILLING_ALERT_RELAY_SECRET?.trim() ?? "";
  if (!target && !secret) return null;
  if (!target || secret.length < 32) throw new Error("INVALID_ALERT_RELAY_CONFIG");
  let url: URL;
  try { url = new URL(target); }
  catch { throw new Error("INVALID_ALERT_RELAY_CONFIG"); }
  // Configuration comes only from server environment. Never accept a URL in an HTTP request.
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !url.hostname.includes(".") || /(^localhost$|\.local$|\.internal$|\.onion$)/i.test(url.hostname) ||
    /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.includes(":")) {
    throw new Error("INVALID_ALERT_RELAY_CONFIG");
  }
  return { url, secret };
}

/** Independent handoff contract. The receiving relay must verify HMAC, dedupe the
 * stable delivery key and map audience roles to its configured on-call recipients.
 * A 2xx means accepted by relay, not operator acknowledgement.
 */
export async function processBillingOperationalRelay(now = new Date()) {
  const config = operationalRelayConfig();
  if (!config) return { enabled: false, delivered: 0, deferred: 0, dead: 0, cancelled: 0 };
  // Recover crashes after the last permitted attempt. Never renew an active lease.
  const exhausted = await prisma.billingOperationalRelay.updateMany({
    where: { state: "PENDING", attempts: { gte: maximumAttempts },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { state: "DEAD", deadLetterAt: now, leaseOwner: null, leaseUntil: null,
      lastErrorCode: "RELAY_ATTEMPTS_EXHAUSTED" },
  });
  const work = await prisma.billingOperationalRelay.findMany({
    where: { state: "PENDING", deadLetterAt: null, attempts: { lt: maximumAttempts },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20,
    select: { id: true },
  });
  const tally = { enabled: true, delivered: 0, deferred: 0, dead: exhausted.count, cancelled: 0 };
  for (const row of work) {
    const leaseOwner = randomUUID();
    const acquired = await prisma.billingOperationalRelay.updateMany({
      where: { id: row.id, state: "PENDING", attempts: { lt: maximumAttempts }, nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
      data: { leaseOwner, leaseUntil: new Date(now.getTime() + leaseMs),
        attempts: { increment: 1 } },
    });
    if (!acquired.count) continue;
    const job = await prisma.billingOperationalRelay.findUniqueOrThrow({
      where: { id: row.id }, include: { incident: true },
    });
    if (job.incident.state === "RESOLVED" || job.generation !== job.incident.generation) {
      await prisma.billingOperationalRelay.updateMany({ where: { id: row.id, leaseOwner },
        data: { state: "CANCELLED", leaseOwner: null, leaseUntil: null } });
      tally.cancelled++;
      continue;
    }
    const payload = JSON.stringify({
      kind: "FINOVA_BILLING_OPERATIONAL_ALERT", eventId: job.id,
      code: job.incident.code, severity: job.incident.severity,
      count: job.incident.count, phase: job.phase, audience: job.audience,
      generation: job.generation, path: job.incident.href, observedAt: now.toISOString(),
    });
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const signature = createHmac("sha256", config.secret).update(timestamp + "." + payload).digest("hex");
    let ok = false;
    try {
      const response = await fetch(config.url, {
        method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6000),
        headers: { "Content-Type": "application/json", "X-Finova-Alert-Timestamp": timestamp,
          "X-Finova-Alert-Idempotency-Key": job.id, "X-Finova-Alert-Signature": "sha256=" + signature },
        body: payload,
      });
      ok = response.ok;
    } catch {
      // Never store raw network exceptions: they can include endpoint credentials.
    }
    if (ok) {
      const delivered = await prisma.billingOperationalRelay.updateMany({ where: { id: job.id, leaseOwner,
        state: "PENDING" }, data: { state: "DELIVERED", deliveredAt: now, leaseOwner: null,
        leaseUntil: null, lastErrorCode: null } });
      tally.delivered += delivered.count;
    } else {
      const dead = job.attempts >= maximumAttempts;
      const changed = await prisma.billingOperationalRelay.updateMany({ where: { id: job.id, leaseOwner,
        state: "PENDING" }, data: {
          state: dead ? "DEAD" : "PENDING", deadLetterAt: dead ? now : null,
          nextAttemptAt: new Date(now.getTime() + operationalRelayRetryMs(job.attempts)),
          leaseOwner: null, leaseUntil: null, lastErrorCode: "RELAY_DELIVERY_FAILED",
        } });
      if (dead) tally.dead += changed.count;
      else tally.deferred += changed.count;
    }
  }
  return tally;
}
