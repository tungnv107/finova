import { Decimal, money } from "@/lib/money";

type StatementActivity = {
  kind: "PURCHASE" | "PAYMENT" | "REFUND";
  amount: string;
  // Only refunds of purchases already included at closing can offset this statement.
  originalPurchaseDate?: Date | null;
};

/** Estimated unpaid part of a closed statement, based solely on recorded ledger events.
 * Payments after closing reduce the estimate. Refunds only count when their
 * original purchase belonged to that statement or an earlier cycle.
 * This is not a bank-issued minimum payment or an authoritative statement.
 */
export function estimatedStatementRemaining(
  balanceAtClose: string,
  closedThrough: Date,
  activitiesAfterClose: StatementActivity[],
): string {
  const credits = activitiesAfterClose.reduce((sum, activity) => {
    if (activity.kind === "PAYMENT" || (activity.kind === "REFUND" && activity.originalPurchaseDate
      && activity.originalPurchaseDate.getTime() <= closedThrough.getTime())) {
      return sum.plus(activity.amount);
    }
    return sum;
  }, new Decimal(0));
  return money(Decimal.max(0, new Decimal(balanceAtClose).minus(credits)));
}
