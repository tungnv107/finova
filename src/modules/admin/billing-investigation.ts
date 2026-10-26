import { prisma } from "@/lib/db";
import type { BillingOrderStatus } from "@finova/prisma";

const statuses = ["PENDING_PAYMENT", "PAID", "EXPIRED", "REVIEW", "REFUNDED"] as const;

export function parseBillingOrderFilter(value?: string): BillingOrderStatus | undefined {
  return statuses.find(status => status === value);
}

export async function listBillingOrdersForOperations({ page, status }: { page: number; status?: BillingOrderStatus }) {
  const pageSize = 25;
  const where = status ? { status } : {};
  const [total, orders] = await Promise.all([
    prisma.billingOrder.count({ where }),
    prisma.billingOrder.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: page * pageSize, take: pageSize,
      select: { id: true, orderCode: true, createdAt: true, expiresAt: true,
        paidAt: true, activatedAt: true, status: true, billingPeriodSnapshot: true,
        amountDueVnd: true, receiver: { select: { bankCode: true, accountNumberLast4: true } } },
    }),
  ]);
  return { total, pageSize, orders: orders.map(order => ({
    ...order, amountDueVnd: order.amountDueVnd.toString(),
    receiver: `${order.receiver.bankCode} · ••••${order.receiver.accountNumberLast4}`,
  })) };
}

const allowedAuditActions = ["RECEIVER_APPROVE", "PRICE_PUBLISH", "PRICE_UNPUBLISH", "USER_ACCESS_CHANGE",
  "SUBSCRIPTION_ACTION_APPROVED", "BILLING_RECONCILIATION_REQUEUE", "BILLING_NOTICE_REQUEUE"] as const;

export function parseSensitiveAuditAction(value?: string) {
  return allowedAuditActions.find(action => action === value);
}

export async function listSensitiveAdminAudit({ page, action }: { page: number; action?: string }) {
  const pageSize = 25;
  // Enforce the allowlist here as well as in the page parser. Other callers must
  // never be able to turn this into a general-purpose audit/PII lookup.
  const selected = parseSensitiveAuditAction(action);
  const where = { action: selected ? { equals: selected } : { in: [...allowedAuditActions] } };
  const [total, events] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: page * pageSize, take: pageSize,
      select: { id: true, action: true, resourceType: true, createdAt: true },
    }),
  ]);
  return { total, pageSize, events };
}
