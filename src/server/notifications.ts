import { prisma } from "@/lib/db";
import { cycleDates, localDay } from "@/lib/dates";
import { Decimal } from "@/lib/money";
import { HttpError } from "@/server/context";
import { listCreditCards } from "@/server/credit-cards";
import { requireWorkspacePremium } from "@/server/premium";
import { requireWorkspacePremiumInDb } from "@/server/premium";
import { serializable } from "@/server/serializable";

// Persisted keys prevent duplicate reminders across repeated visits/jobs.
export async function reconcileNotifications(workspaceId: string, now = new Date()) {
  await requireWorkspacePremium(workspaceId, "NOTIFICATIONS");
  const today = localDay(now);
  const coming = localDay(new Date(now.getTime() + 7 * 86400_000));
  const [occurrences, debts, cards, alerts] = await Promise.all([
    prisma.recurringOccurrence.findMany({ where: { workspaceId, status: "PENDING", dueAt: { lte: new Date(`${coming}T23:59:59+07:00`) }, rule: { paused: false } }, include: { rule: { select: { name: true } } }, take: 200 }),
    prisma.debtContract.findMany({ where: { workspaceId, dueAt: { lte: new Date(`${coming}T23:59:59+07:00`) } }, include: { payments: { select: { principal: true } } }, take: 100 }),
    listCreditCards(workspaceId),
    prisma.budgetAlert.findMany({ where: { resolvedAt: null, budget: { workspaceId, archivedAt: null } }, include: { budget: { select: { name: true } } }, take: 100 }),
  ]);
  const notifications: { key: string; title: string; body: string; link: string }[] = [];
  for (const o of occurrences) notifications.push({ key: `recurring:${o.id}`, title: "Giao dịch định kỳ", body: `${o.rule.name} — ngày ${o.periodKey}${o.periodKey < today ? " (quá hạn)" : ""}`, link: "/recurring" });
  for (const debt of debts) {
    const paid = debt.payments.reduce((s, p) => s.plus(p.principal.toString()), new Decimal(0));
    if (paid.lt(debt.principal.toString()) && debt.dueAt) notifications.push({ key: `debt:${debt.id}:${localDay(debt.dueAt)}`, title: "Hạn trả khoản vay", body: `${debt.counterparty} — ${localDay(debt.dueAt)}`, link: "/debts" });
  }
  for (const card of cards) {
    // A paid-off card has no current repayment obligation.
    if (new Decimal(card.estimatedStatementRemaining).lte(0)) continue;
    const days = cycleDates(today, card.statementDay, card.paymentDueDay);
    const due = days.lastPaymentDueDate >= today ? days.lastPaymentDueDate : days.projectedDueDate;
    if (due <= coming) notifications.push({ key: `card:${card.id}:${due}`, title: "Kiểm tra hạn thanh toán thẻ", body: `${card.name} — hạn dự kiến ${due}. Đối chiếu sao kê ngân hàng.`, link: "/cards" });
  }
  for (const alert of alerts) notifications.push({ key: `budget:${alert.id}`, title: "Ngân sách đạt ngưỡng",
    body: `${alert.budget.name}: ${alert.threshold === "OVER100" ? ">100" : alert.threshold.slice(1)}%.`, link: "/budgets" });
  if (!notifications.length) return 0;
  await serializable(async db => {
    // Entitlement may expire while the preceding queries calculate reminders.
    await requireWorkspacePremiumInDb(db, workspaceId, "NOTIFICATIONS");
    for (const n of notifications) {
      await db.notification.upsert({ where: { workspaceId_key: { workspaceId, key: n.key } }, create: { workspaceId, ...n }, update: {} });
    }
  });
  return notifications.length;
}

export async function listNotifications(workspaceId: string) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.notification.count({ where: { workspaceId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotification(workspaceId: string, id: string, read: boolean) {
  const result = await prisma.notification.updateMany({ where: { id, workspaceId }, data: { readAt: read ? new Date() : null } });
  if (!result.count) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy thông báo.");
  return { id };
}
