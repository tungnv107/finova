export type PremiumFeature = "STATEMENT_IMPORT" | "BANK_SYNC" | "NOTIFICATIONS";
export const PREMIUM_FEATURES: readonly PremiumFeature[] = ["STATEMENT_IMPORT", "BANK_SYNC", "NOTIFICATIONS"];
export const INITIAL_PRICES = [
  { productCode: "PREMIUM_MONTHLY", billingPeriod: "MONTH" as const, periodCount: 1, priceVnd: 29000 },
  { productCode: "PREMIUM_YEARLY", billingPeriod: "YEAR" as const, periodCount: 1, priceVnd: 199000 },
] as const;

/** Refuse corrupt or non-VND catalog rows before creating an irrevocable payment snapshot. */
export function isPurchasablePremiumPrice(price: {
  planCode: string; billingPeriod: string; periodCount: number; currency: string;
  priceVnd: { toString(): string } | string | number | null;
}): boolean {
  if (price.planCode !== "PREMIUM" || price.currency !== "VND" ||
      !["MONTH", "YEAR"].includes(price.billingPeriod) || price.periodCount !== 1 ||
      price.priceVnd === null) return false;
  const value = String(price.priceVnd);
  return /^[1-9]\d*$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER);
}

/** Vietnam has UTC+07 and no daylight-saving transitions. Use calendar months/years, never 30/365 days. */
export function addVietnamCalendarPeriod(start: Date, period: "MONTH" | "YEAR", count = 1, anniversaryDay?: number): Date {
  if (Number.isNaN(start.getTime())) throw new Error("INVALID_START_DATE");
  if (period !== "MONTH" && period !== "YEAR") throw new Error("INVALID_BILLING_PERIOD");
  if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error("INVALID_PERIOD_COUNT");
  const local = new Date(start.getTime() + 7 * 60 * 60 * 1000);
  const day = anniversaryDay ?? local.getUTCDate();
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("INVALID_ANNIVERSARY_DAY");
  const targetMonth = local.getUTCMonth() + (period === "YEAR" ? count * 12 : count);
  const first = new Date(Date.UTC(local.getUTCFullYear(), targetMonth, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay),
    local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds()) - 7 * 60 * 60 * 1000);
}

export function effectivePlanFromGrants(grants: ReadonlyArray<{ startsAt: Date; expiresAt: Date; revokedAt: Date | null }>, now = new Date()) {
  return grants.some(g => !g.revokedAt && g.startsAt <= now && now < g.expiresAt) ? "PREMIUM" : "LITE";
}

export function featureAllowed(plan: "LITE" | "PREMIUM", feature: PremiumFeature) {
  return plan === "PREMIUM" && PREMIUM_FEATURES.includes(feature);
}

/** An order code must be a distinct token; partial matches must never activate another order. */
export function extractBillingOrderCode(reference: string): string | null {
  if (typeof reference !== "string") return null;
  const matches = reference.toUpperCase().match(/(?<![A-Z0-9])FNV[A-F0-9]{20}(?![A-Z0-9])/g) ?? [];
  return matches.length === 1 ? matches[0] : null;
}

export type BankCreditMatchStatus =
  | "MATCHED" | "UNMATCHED" | "REVIEW_AMOUNT" | "REVIEW_RECEIVER"
  | "REVIEW_DIRECTION" | "LATE_PAYMENT_REVIEW" | "REVIEW_ORDER_STATUS"
  | "REVIEW_TIMING";

export function classifyVerifiedBankCredit(input: {
  direction: string;
  amountVnd: bigint;
  receiverAccountId: string;
  occurredAt: Date;
  order: null | {
    receiverAccountId: string;
    amountDueVnd: bigint;
    currency: string;
    status: string;
    createdAt: Date;
    expiresAt: Date;
  };
}): BankCreditMatchStatus {
  if (input.direction !== "IN") return "REVIEW_DIRECTION";
  if (!input.order) return "UNMATCHED";
  if (input.receiverAccountId !== input.order.receiverAccountId || input.order.currency !== "VND") return "REVIEW_RECEIVER";
  if (input.amountVnd <= BigInt(0) || input.order.amountDueVnd <= BigInt(0)) return "REVIEW_AMOUNT";
  if (input.amountVnd !== input.order.amountDueVnd) return "REVIEW_AMOUNT";
  if (input.order.status !== "PENDING_PAYMENT") return "REVIEW_ORDER_STATUS";
  if (![input.occurredAt, input.order.createdAt, input.order.expiresAt].every(date => Number.isFinite(date.getTime())) ||
      input.order.createdAt >= input.order.expiresAt) return "REVIEW_TIMING";
  if (input.occurredAt < input.order.createdAt) return "REVIEW_TIMING";
  if (input.occurredAt >= input.order.expiresAt) return "LATE_PAYMENT_REVIEW";
  return "MATCHED";
}
