import { prisma } from "@/lib/db";
import type { Prisma } from "@finova/prisma";

export type BillingOperationalAlert = {
  code: string;
  severity: "critical" | "warning" | "info";
  count: number;
  title: string;
  explanation: string;
  href: string;
};

type BillingSignals = {
  paymentDeadLetters: number;
  noticeDeadLetters: number;
  stalledPayments: number;
  delayedNotices: number;
  unresolvedExceptions: number;
  overduePendingOrders: number;
  recentPendingOrders: number;
  latestVerifiedEvent: Date | null;
  unusualAdminActionGroups: number;
};

/** Signal thresholds are provisional DEV defaults. No provider heartbeat exists yet.
 * Lack of a payment event is not proof of provider downtime.
 */
export function classifyBillingOperationalSignals(signals: BillingSignals, now = new Date()): BillingOperationalAlert[] {
  const alerts: BillingOperationalAlert[] = [];
  const add = (code: string, severity: BillingOperationalAlert["severity"], count: number,
    title: string, explanation: string, href: string) => {
    if (count > 0) alerts.push({ code, severity, count, title, explanation, href });
  };
  add("PAYMENT_DLQ", "critical", signals.paymentDeadLetters, "Giao dịch chờ đối soát ở hàng lỗi",
    "Worker đã ngừng tự thử lại. Kiểm tra giao dịch ngân hàng và audit trước khi đưa vào xử lý lại.", "/admin/billing/payments?review=1");
  add("NOTICE_DLQ", "critical", signals.noticeDeadLetters, "Thông báo kích hoạt ở hàng lỗi",
    "Quyền Premium có thể đã cấp nhưng thông báo chưa được gửi; cần kiểm tra và replay có lý do.", "/admin/billing/notices");
  add("MATCHING_LAG", "warning", signals.stalledPayments, "Giao dịch đã xác thực xử lý chậm",
    "Giao dịch RECEIVED quá 15 phút, chưa được worker khớp hoặc chuyển sang xử lý ngoại lệ.", "/admin/billing/payments?review=1");
  add("NOTICE_LAG", "warning", signals.delayedNotices, "Hàng gửi thông báo xử lý chậm",
    "Thông báo PENDING quá 15 phút và đã đến thời điểm có thể xử lý.", "/admin/billing/notices");
  add("PAYMENT_EXCEPTION", "warning", signals.unresolvedExceptions, "Giao dịch đối soát ngoại lệ",
    "Trạng thái khác MATCHED/RECEIVED, đã tồn tại trên 15 phút; cần đối chiếu chứng từ trước khi điều chỉnh.", "/admin/billing/payments?review=1");
  add("OVERDUE_ORDER", "warning", signals.overduePendingOrders, "Đơn hết hạn còn chờ thanh toán",
    "Đơn PENDING_PAYMENT đã quá hạn trên 10 phút; kiểm tra tiến trình hết hạn và cập nhật trạng thái.", "/admin/billing/orders");
  add("ADMIN_AUDIT_BURST", "warning", signals.unusualAdminActionGroups, "Thao tác quản trị nhạy cảm tập trung",
    "Một người thực hiện ít nhất 5 thao tác cùng loại trong 15 phút; kiểm tra nhật ký và bối cảnh nghiệp vụ.", "/admin/audit");
  const lastSignalAge = signals.latestVerifiedEvent ? now.getTime() - signals.latestVerifiedEvent.getTime() : Infinity;
  if (signals.recentPendingOrders > 0 && lastSignalAge >= 2 * 60 * 60_000) {
    alerts.push({ code: "IPN_NO_SIGNAL", severity: "info", count: signals.recentPendingOrders,
      title: "Thiếu tín hiệu nhận tiền khi có đơn chờ",
      explanation: "Có đơn chờ trong 2 giờ qua nhưng không có giao dịch xác thực mới. Đây là tín hiệu cần kiểm tra, chưa xác nhận IPN/provider bị gián đoạn; cần heartbeat và polling độc lập.",
      href: "/admin/billing/payments?review=1" });
  }
  return alerts;
}

/** Aggregate-only operational observations. No identifiers, bank references or PII leave this service. */
export async function getBillingOperationalAlerts(now = new Date(), db: Prisma.TransactionClient = prisma) {
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60_000);
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);
  const [paymentDeadLetters, noticeDeadLetters, stalledPayments, delayedNotices,
    unresolvedExceptions, overduePendingOrders, recentPendingOrders, latestPayment, adminActionGroups] = await Promise.all([
    db.billingPaymentEvent.count({ where: { deadLetteredAt: { not: null } } }),
    db.billingOutbox.count({ where: { deadLetteredAt: { not: null } } }),
    db.billingPaymentEvent.count({ where: { verificationStatus: "VERIFIED", matchStatus: "RECEIVED",
      deadLetteredAt: null, receivedAt: { lt: fifteenMinutesAgo }, nextAttemptAt: { lte: now } } }),
    db.billingOutbox.count({ where: { status: "PENDING", deadLetteredAt: null,
      createdAt: { lt: fifteenMinutesAgo }, nextAttemptAt: { lte: now } } }),
    db.billingPaymentEvent.count({ where: { verificationStatus: "VERIFIED",
      matchStatus: { notIn: ["MATCHED", "RECEIVED"] }, receivedAt: { lt: fifteenMinutesAgo } } }),
    db.billingOrder.count({ where: { status: "PENDING_PAYMENT", expiresAt: { lt: tenMinutesAgo } } }),
    db.billingOrder.count({ where: { status: "PENDING_PAYMENT", createdAt: { gte: twoHoursAgo } } }),
    db.billingPaymentEvent.aggregate({ where: { verificationStatus: "VERIFIED" }, _max: { receivedAt: true } }),
    db.adminAuditLog.groupBy({ by: ["actorId", "action"],
      where: { createdAt: { gte: fifteenMinutesAgo }, action: { in: [
        "RECEIVER_APPROVE", "PRICE_PUBLISH", "PRICE_UNPUBLISH", "USER_ACCESS_CHANGE",
        "SUBSCRIPTION_ACTION_APPROVED", "BILLING_RECONCILIATION_REQUEUE", "BILLING_NOTICE_REQUEUE",
      ] } }, _count: { _all: true }, having: { id: { _count: { gte: 5 } } } }),
  ]);
  const signals: BillingSignals = { paymentDeadLetters, noticeDeadLetters, stalledPayments,
    delayedNotices, unresolvedExceptions, overduePendingOrders, recentPendingOrders,
    latestVerifiedEvent: latestPayment._max.receivedAt, unusualAdminActionGroups: adminActionGroups.length };
  return { checkedAt: now, alerts: classifyBillingOperationalSignals(signals, now) };
}
