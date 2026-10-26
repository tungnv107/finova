import { prisma } from "@/lib/db";
import { extractBillingOrderCode } from "@/modules/billing/domain";

export const paymentPageSize = 30;
export const paymentReviewStatuses = ["RECEIVED", "UNMATCHED", "REVIEW_AMOUNT", "REVIEW_RECEIVER",
  "REVIEW_DIRECTION", "LATE_PAYMENT_REVIEW", "REVIEW_ORDER_STATUS", "REVIEW_TIMING"] as const;

/** Minimal fields for Finance. Never return raw payment memo, bank account number or payer details. */
export async function listAdminPayments(input: { page?: number; reviewOnly?: boolean }) {
  const page = Math.min(1000, Math.max(0, Math.floor(input.page ?? 0)));
  const where = input.reviewOnly ? { matchStatus: { in: [...paymentReviewStatuses] } } : {};
  const [total, rows] = await Promise.all([
    prisma.billingPaymentEvent.count({ where }),
    prisma.billingPaymentEvent.findMany({ where, take: paymentPageSize, skip: page * paymentPageSize,
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      select: { id: true, provider: true, providerTransactionId: true, direction: true,
        amountVnd: true, reference: true, verificationStatus: true, matchStatus: true,
        occurredAt: true, receivedAt: true, attemptCount: true, nextAttemptAt: true,
        leaseUntil: true, deadLetteredAt: true, lastErrorCode: true,
        allocation: { select: { orderId: true } },
      } }),
  ]);
  return { total, page, pageSize: paymentPageSize,
    events: rows.map(row => ({
      id: row.id, provider: row.provider,
      transactionMasked: `••••${row.providerTransactionId.slice(-4)}`,
      direction: row.direction, amountVnd: Number(row.amountVnd),
      transferReference: extractBillingOrderCode(row.reference),
      verificationStatus: row.verificationStatus, matchStatus: row.matchStatus,
      attemptCount: row.attemptCount, nextAttemptAt: row.nextAttemptAt,
      leaseUntil: row.leaseUntil, deadLetteredAt: row.deadLetteredAt,
      lastErrorCode: row.lastErrorCode,
      occurredAt: row.occurredAt, receivedAt: row.receivedAt,
      orderId: row.allocation?.orderId ?? null,
    })) };
}
