import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { sanitizeOperatorReason } from "@/modules/admin/privacy";
import { HttpError } from "@/server/context";
import { serializable } from "@/server/serializable";
import type { SystemActor } from "@/server/system-auth";
import { addVietnamCalendarPeriod, classifyVerifiedBankCredit, extractBillingOrderCode } from "./domain";

/**
 * Provider adapter boundary. Call only AFTER the acquiring bank/provider authenticated
 * the event, verified it is a final posted transaction and resolved the receiving
 * account to a BillingReceivingAccount.id. This module deliberately exposes no HTTP
 * endpoint and does not accept client-submitted receipts as proof of payment.
 */
export type VerifiedBankCredit = {
  provider: string;
  receiverAccountId: string;
  providerTransactionId: string;
  direction: "IN" | "OUT";
  amountVnd: string;
  reference: string;
  occurredAt: Date;
};

function validateCredit(credit: VerifiedBankCredit) {
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(credit.provider) ||
      !/^[A-Za-z0-9_-]{6,150}$/.test(credit.receiverAccountId) ||
      !/^[A-Za-z0-9_:/.-]{1,160}$/.test(credit.providerTransactionId) ||
      !/^[1-9][0-9]{0,19}$/.test(credit.amountVnd) ||
      !["IN", "OUT"].includes(credit.direction) ||
      typeof credit.reference !== "string" || credit.reference.length > 1000 ||
      !(credit.occurredAt instanceof Date) || !Number.isFinite(credit.occurredAt.getTime())) {
    throw new HttpError(422, "INVALID_BANK_EVENT", "Dữ liệu giao dịch ngân hàng không hợp lệ.");
  }
}

/** Durable event insertion is separate from allocation, so a failed worker can replay. */
export async function recordVerifiedBankCredit(credit: VerifiedBankCredit) {
  validateCredit(credit);
  return serializable(async db => {
    const key = { provider: credit.provider, providerAccountRef: credit.receiverAccountId,
      providerTransactionId: credit.providerTransactionId };
    const prior = await db.billingPaymentEvent.findUnique({ where: {
      provider_providerAccountRef_providerTransactionId: key,
    } });
    if (prior) {
      // The bank's immutable transaction ID must never be reused for different details.
      if (prior.direction !== credit.direction || prior.amountVnd.toString() !== credit.amountVnd ||
          prior.reference !== credit.reference || prior.occurredAt.getTime() !== credit.occurredAt.getTime()) {
        throw new HttpError(409, "PAYMENT_EVENT_CONFLICT", "Mã giao dịch ngân hàng có nội dung không nhất quán.");
      }
      return { id: prior.id, status: prior.matchStatus, duplicate: true };
    }
    const event = await db.billingPaymentEvent.create({ data: {
      ...key, direction: credit.direction, amountVnd: credit.amountVnd,
      reference: credit.reference, occurredAt: credit.occurredAt,
      verificationStatus: "VERIFIED", matchStatus: "RECEIVED",
    } });
    return { id: event.id, status: "RECEIVED", duplicate: false };
  });
}

/** Atomic match + allocation + grant; serializable for concurrent renewal on one user. */
export async function reconcileVerifiedBankCredit(eventId: string) {
  return serializable(async db => {
    const event = await db.billingPaymentEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new HttpError(404, "PAYMENT_EVENT_NOT_FOUND", "Không tìm thấy giao dịch.");
    if (event.verificationStatus !== "VERIFIED") throw new HttpError(403, "UNVERIFIED_PAYMENT", "Giao dịch chưa được xác thực.");
    if (event.matchStatus !== "RECEIVED") return { eventId, status: event.matchStatus, orderId: null };

    const orderCode = extractBillingOrderCode(event.reference);
    const order = orderCode ? await db.billingOrder.findUnique({ where: { orderCode } }) : null;
    const status = classifyVerifiedBankCredit({
      direction: event.direction, amountVnd: BigInt(event.amountVnd.toString()),
      receiverAccountId: event.providerAccountRef, occurredAt: event.occurredAt,
      order: order ? {
        receiverAccountId: order.receiverAccountId, amountDueVnd: BigInt(order.amountDueVnd.toString()),
        currency: order.currency, status: order.status, createdAt: order.createdAt, expiresAt: order.expiresAt,
      } : null,
    });
    if (status !== "MATCHED" || !order) {
      await db.billingPaymentEvent.update({ where: { id: eventId }, data: { matchStatus: status } });
      return { eventId, status, orderId: order?.id ?? null };
    }

    const now = new Date();
    const latestGrant = await db.subscriptionGrant.findFirst({ where: {
      userId: order.userId, revokedAt: null, expiresAt: { gt: now },
    }, orderBy: { expiresAt: "desc" } });
    const current = await db.subscription.findUnique({ where: { userId: order.userId } });
    const startsAt = latestGrant && latestGrant.expiresAt > now ? latestGrant.expiresAt : now;
    const vnDay = new Date(startsAt.getTime() + 7 * 60 * 60 * 1000).getUTCDate();
    const anniversaryDay = latestGrant ? (current?.billingAnniversaryDay ?? vnDay) : vnDay;
    const expiresAt = addVietnamCalendarPeriod(startsAt, order.billingPeriodSnapshot, order.periodCountSnapshot, anniversaryDay);

    await db.paymentAllocation.create({ data: {
      paymentEventId: eventId, orderId: order.id, amountVnd: order.amountDueVnd,
    } });
    const grant = await db.subscriptionGrant.create({ data: {
      userId: order.userId, orderId: order.id, grantType: "BANK_PAYMENT",
      billingPeriod: order.billingPeriodSnapshot, periodCount: order.periodCountSnapshot,
      startsAt, expiresAt,
    } });
    await db.subscriptionEvent.create({ data: {
      userId: order.userId, grantId: grant.id, orderId: order.id,
      kind: "GRANT_ACTIVATED", startsAt, expiresAt,
    } });
    await db.subscription.upsert({ where: { userId: order.userId },
      create: { userId: order.userId, planCode: "PREMIUM", startsAt, expiresAt, billingAnniversaryDay: anniversaryDay },
      update: { planCode: "PREMIUM", expiresAt, billingAnniversaryDay: anniversaryDay },
    });
    await db.billingOrder.update({ where: { id: order.id }, data: {
      status: "PAID", paidAt: event.occurredAt, activatedAt: now,
    } });
    await db.billingPaymentEvent.update({ where: { id: eventId }, data: { matchStatus: "MATCHED" } });
    await db.billingOutbox.create({ data: {
      orderId: order.id, userId: order.userId, kind: "PREMIUM_ACTIVATED",
    } });
    await db.adminAuditLog.create({ data: {
      actorId: `BANK_PROVIDER:${event.provider}`, action: "PREMIUM_PAYMENT_MATCHED",
      resourceType: "BILLING_ORDER", resourceId: order.id,
      afterJson: { paymentEventId: event.id, userId: order.userId, grantExpiresAt: expiresAt.toISOString() },
    } });
    return { eventId, status: "MATCHED" as const, orderId: order.id, expiresAt };
  });
}

const leaseMs = 2 * 60_000;
export const billingMaxReconcileAttempts = 6;
export function billingReconcileRetryDelayMs(attempt: number) {
  return Math.min(30 * 60_000, 15_000 * 2 ** Math.min(10, Math.max(0, attempt - 1)));
}

const unclaimed = (now: Date) => ({
  provider: "SEPAY_BILLING", verificationStatus: "VERIFIED", matchStatus: "RECEIVED",
  deadLetteredAt: null, nextAttemptAt: { lte: now },
  OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
});

/** Atomic compare-and-set claim: two processes may select the same event, but only one receives a lease. */
export async function claimPendingBillingCredit(eventId: string, now = new Date()) {
  const leaseOwner = randomUUID();
  const claimed = await prisma.billingPaymentEvent.updateMany({ where: { id: eventId, ...unclaimed(now) },
    data: { leaseOwner, leaseUntil: new Date(now.getTime() + leaseMs), attemptCount: { increment: 1 } } });
  return claimed.count === 1 ? leaseOwner : null;
}

/** A poison event is isolated: retry with exponential backoff, then move to a visible DLQ. */
export async function deferFailedBillingCredit(eventId: string, leaseOwner: string, now = new Date()) {
  const event = await prisma.billingPaymentEvent.findUnique({ where: { id: eventId },
    select: { leaseOwner: true, attemptCount: true } });
  if (!event || event.leaseOwner !== leaseOwner) return "LOST_LEASE" as const;
  const deadLettered = event.attemptCount >= billingMaxReconcileAttempts;
  const updated = await prisma.billingPaymentEvent.updateMany({ where: { id: eventId, leaseOwner, matchStatus: "RECEIVED" },
    data: { leaseOwner: null, leaseUntil: null, lastErrorCode: "RECONCILIATION_FAILED",
      nextAttemptAt: new Date(now.getTime() + billingReconcileRetryDelayMs(event.attemptCount)),
      deadLetteredAt: deadLettered ? now : null } });
  return updated.count === 0 ? "LOST_LEASE" as const : deadLettered ? "DEAD_LETTER" as const : "RETRY" as const;
}

/** Operational replay never changes verification status or directly grants Premium. */
export async function requeueDeadLetterBillingCredit(actor: SystemActor, eventId: string, reason: string) {
  const sanitizedReason = sanitizeOperatorReason(reason);
  if (sanitizedReason.length < 12 || reason.length > 500) {
    throw new HttpError(422, "REPLAY_REASON_REQUIRED", "Cần ghi rõ lý do xử lý lại (12–500 ký tự).");
  }
  return serializable(async db => {
    const event = await db.billingPaymentEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new HttpError(404, "PAYMENT_EVENT_NOT_FOUND", "Không tìm thấy giao dịch.");
    if (event.verificationStatus !== "VERIFIED" || event.matchStatus !== "RECEIVED" || !event.deadLetteredAt ||
        (event.leaseUntil && event.leaseUntil > new Date())) {
      throw new HttpError(409, "REPLAY_NOT_ALLOWED", "Giao dịch không ở hàng lỗi có thể xử lý lại.");
    }
    const updated = await db.billingPaymentEvent.updateMany({ where: { id: eventId, deadLetteredAt: { not: null }, matchStatus: "RECEIVED" },
      data: { deadLetteredAt: null, attemptCount: 0, nextAttemptAt: new Date(), leaseUntil: null,
        leaseOwner: null, lastErrorCode: null } });
    if (!updated.count) throw new HttpError(409, "REPLAY_CONFLICT", "Giao dịch đã được xử lý.");
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "BILLING_RECONCILIATION_REQUEUE",
      resourceType: "BILLING_PAYMENT_EVENT", resourceId: eventId,
      beforeJson: { attempts: event.attemptCount, lastErrorCode: event.lastErrorCode },
      afterJson: { reason: sanitizedReason, state: "RECEIVED" } } });
    return { id: eventId, status: "QUEUED" as const };
  });
}

/** Bounded durable recovery pass. ACKed events survive crashes and failed events cannot block a batch. */
export async function processPendingVerifiedBillingCredits(batchSize = 20) {
  const limit = Math.min(50, Math.max(1, Math.floor(batchSize)));
  const pending = await prisma.billingPaymentEvent.findMany({ where: unclaimed(new Date()),
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: limit, select: { id: true } });
  const counts = { processed: 0, matched: 0, review: 0, retried: 0, deadLettered: 0, contended: 0 };
  for (const event of pending) {
    const leaseOwner = await claimPendingBillingCredit(event.id);
    if (!leaseOwner) { counts.contended++; continue; }
    try {
      const result = await reconcileVerifiedBankCredit(event.id);
      await prisma.billingPaymentEvent.updateMany({ where: { id: event.id, leaseOwner },
        data: { leaseOwner: null, leaseUntil: null, lastErrorCode: null } });
      counts.processed++;
      if (result.status === "MATCHED") counts.matched++;
      else counts.review++;
    } catch {
      // Do not store exception text: DB/provider errors may contain credentials or sensitive payloads.
      const action = await deferFailedBillingCredit(event.id, leaseOwner);
      if (action === "RETRY") counts.retried++;
      if (action === "DEAD_LETTER") counts.deadLettered++;
    }
  }
  return counts;
}
