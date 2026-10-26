import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { HttpError } from "@/server/context";
import { serializable } from "@/server/serializable";
import type { SystemActor } from "@/server/system-auth";
import { sanitizeOperatorReason } from "@/modules/admin/privacy";

const leaseMs = 2 * 60_000;
export const billingOutboxMaxAttempts = 6;

export function billingOutboxRetryDelayMs(attempt: number) {
  return Math.min(30 * 60_000, 15_000 * 2 ** Math.min(10, Math.max(0, attempt - 1)));
}

const available = (now: Date) => ({
  status: "PENDING", deadLetteredAt: null, attemptCount: { lt: billingOutboxMaxAttempts }, nextAttemptAt: { lte: now },
  OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
});

/** An exhausted lease may be left behind when a worker crashes on its final attempt.
 * Move it to DLQ before claiming new work. A live lease must never be interrupted.
 */
export async function deadLetterExpiredBillingOutbox(now = new Date()) {
  const result = await prisma.billingOutbox.updateMany({
    where: {
      status: "PENDING", deadLetteredAt: null, attemptCount: { gte: billingOutboxMaxAttempts },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    data: {
      deadLetteredAt: now, leaseOwner: null, leaseUntil: null,
      lastErrorCode: "NOTICE_LEASE_EXHAUSTED",
    },
  });
  return result.count;
}

export async function claimBillingOutbox(id: string, now = new Date()) {
  const owner = randomUUID();
  const claimed = await prisma.billingOutbox.updateMany({ where: { id, ...available(now) },
    data: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + leaseMs), attemptCount: { increment: 1 } } });
  return claimed.count === 1 ? owner : null;
}

/** Delivery is a durable, user-scoped in-app billing notice, separate from optional Premium alerts.
 * Notice insertion and marking outbox delivered commit atomically. A crash or expired lease can
 * never create two notices for the same outbox entry.
 */
export async function deliverBillingOutbox(id: string, owner: string, now = new Date()) {
  return serializable(async db => {
    const event = await db.billingOutbox.findUnique({ where: { id } });
    if (!event || event.leaseOwner !== owner || event.status !== "PENDING" || event.deadLetteredAt ||
        !event.leaseUntil || event.leaseUntil <= now) return "LOST_LEASE" as const;
    await db.billingNotice.createMany({ data: { outboxId: id, userId: event.userId,
      orderId: event.orderId, kind: event.kind }, skipDuplicates: true });
    const updated = await db.billingOutbox.updateMany({ where: { id, leaseOwner: owner, status: "PENDING" },
      data: { status: "DELIVERED", deliveredAt: now, leaseOwner: null, leaseUntil: null, lastErrorCode: null } });
    if (updated.count !== 1) throw new Error("OUTBOX_CONCURRENT_DELIVERY");
    return "DELIVERED" as const;
  });
}

/** Retry a failed delivery with bounded backoff; a poison entry becomes visible in DLQ. */
export async function deferBillingOutbox(id: string, owner: string, now = new Date()) {
  const event = await prisma.billingOutbox.findUnique({ where: { id }, select: { leaseOwner: true, attemptCount: true } });
  if (!event || event.leaseOwner !== owner) return "LOST_LEASE" as const;
  const dead = event.attemptCount >= billingOutboxMaxAttempts;
  const updated = await prisma.billingOutbox.updateMany({ where: { id, leaseOwner: owner, status: "PENDING" },
    data: { leaseOwner: null, leaseUntil: null, lastErrorCode: "NOTICE_DELIVERY_FAILED",
      nextAttemptAt: new Date(now.getTime() + billingOutboxRetryDelayMs(event.attemptCount)),
      deadLetteredAt: dead ? now : null } });
  return updated.count === 0 ? "LOST_LEASE" as const : dead ? "DEAD_LETTER" as const : "RETRY" as const;
}

export async function processPendingBillingNotices(batchSize = 20) {
  const limit = Math.min(50, Math.max(1, Math.floor(batchSize)));
  const recoveredDeadLetters = await deadLetterExpiredBillingOutbox();
  const rows = await prisma.billingOutbox.findMany({ where: available(new Date()),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit, select: { id: true } });
  const counts = { delivered: 0, retried: 0, deadLettered: recoveredDeadLetters, contended: 0 };
  for (const row of rows) {
    const owner = await claimBillingOutbox(row.id);
    if (!owner) { counts.contended++; continue; }
    try {
      const result = await deliverBillingOutbox(row.id, owner);
      if (result === "DELIVERED") counts.delivered++;
      else counts.contended++;
    } catch {
      // Never persist exception messages: they can include database credentials or PII.
      const result = await deferBillingOutbox(row.id, owner);
      if (result === "RETRY") counts.retried++;
      if (result === "DEAD_LETTER") counts.deadLettered++;
    }
  }
  return counts;
}

/** Manual recovery requires a different action than granting Premium, with a reason and audit. */
export async function requeueDeadLetterBillingNotice(actor: SystemActor, id: string, reason: string) {
  const sanitizedReason = sanitizeOperatorReason(reason);
  if (sanitizedReason.length < 12 || reason.length > 500) {
    throw new HttpError(422, "REPLAY_REASON_REQUIRED", "Cần ghi rõ lý do xử lý lại (12–500 ký tự).");
  }
  return serializable(async db => {
    const event = await db.billingOutbox.findUnique({ where: { id } });
    if (!event) throw new HttpError(404, "OUTBOX_NOT_FOUND", "Không tìm thấy thông báo chờ gửi.");
    if (event.status !== "PENDING" || !event.deadLetteredAt ||
        (event.leaseUntil && event.leaseUntil > new Date())) {
      throw new HttpError(409, "REPLAY_NOT_ALLOWED", "Thông báo không ở hàng lỗi có thể xử lý lại.");
    }
    const result = await db.billingOutbox.updateMany({ where: { id, status: "PENDING", deadLetteredAt: { not: null } },
      data: { deadLetteredAt: null, attemptCount: 0, nextAttemptAt: new Date(),
        leaseOwner: null, leaseUntil: null, lastErrorCode: null } });
    if (result.count !== 1) throw new HttpError(409, "REPLAY_CONFLICT", "Thông báo đã được xử lý.");
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "BILLING_NOTICE_REQUEUE",
      resourceType: "BILLING_OUTBOX", resourceId: id,
      beforeJson: { attempts: event.attemptCount, lastErrorCode: event.lastErrorCode },
      afterJson: { reason: sanitizedReason, state: "PENDING" } } });
    return { id, status: "QUEUED" as const };
  });
}
