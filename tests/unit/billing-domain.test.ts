import { describe, expect, it } from "vitest";
import { addVietnamCalendarPeriod, classifyVerifiedBankCredit, effectivePlanFromGrants, extractBillingOrderCode, featureAllowed, INITIAL_PRICES, isPurchasablePremiumPrice } from "../../src/modules/billing/domain";

const inVietnam = (iso: string) => new Date(iso);

describe("Premium prices and entitlement", () => {
  it("rejects zero, null, unsafe, non-integer and non-VND catalog prices", () => {
    const valid = { planCode: "PREMIUM", billingPeriod: "MONTH", periodCount: 1, currency: "VND", priceVnd: "29000" };
    expect(isPurchasablePremiumPrice(valid)).toBe(true);
    for (const priceVnd of [null, 0, -1, 1.5, "0", "-100", "29.5", "1e5", "9007199254740992"] ) {
      expect(isPurchasablePremiumPrice({ ...valid, priceVnd })).toBe(false);
    }
    expect(isPurchasablePremiumPrice({ ...valid, priceVnd: Number.MAX_SAFE_INTEGER })).toBe(true);
    expect(isPurchasablePremiumPrice({ ...valid, priceVnd: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    expect(isPurchasablePremiumPrice({ ...valid, currency: "USD" })).toBe(false);
    expect(isPurchasablePremiumPrice({ ...valid, planCode: "LITE" })).toBe(false);
    expect(isPurchasablePremiumPrice({ ...valid, billingPeriod: "WEEK" })).toBe(false);
    expect(isPurchasablePremiumPrice({ ...valid, periodCount: 0 })).toBe(false);
    expect(isPurchasablePremiumPrice({ ...valid, periodCount: 2 })).toBe(false);
  });
  it("publishes the agreed 29k and 199k VND product prices", () => {
    expect(INITIAL_PRICES.map(p => [p.productCode, p.priceVnd])).toEqual([
      ["PREMIUM_MONTHLY", 29000], ["PREMIUM_YEARLY", 199000],
    ]);
  });
  it("denies the three tools on Lite and allows Premium", () => {
    for (const feature of ["STATEMENT_IMPORT", "BANK_SYNC", "NOTIFICATIONS"] as const) {
      expect(featureAllowed("LITE", feature)).toBe(false);
      expect(featureAllowed("PREMIUM", feature)).toBe(true);
    }
  });
  it("uses start-inclusive and expiry-exclusive active grants", () => {
    const grant = { startsAt: inVietnam("2026-10-23T00:00:00+07:00"),
      expiresAt: inVietnam("2026-11-23T00:00:00+07:00"), revokedAt: null };
    expect(effectivePlanFromGrants([grant], inVietnam("2026-10-22T23:59:59+07:00"))).toBe("LITE");
    expect(effectivePlanFromGrants([grant], grant.startsAt)).toBe("PREMIUM");
    expect(effectivePlanFromGrants([grant], grant.expiresAt)).toBe("LITE");
    expect(effectivePlanFromGrants([{ ...grant, revokedAt: grant.startsAt }], grant.startsAt)).toBe("LITE");
    expect(effectivePlanFromGrants([], grant.startsAt)).toBe("LITE");
    expect(effectivePlanFromGrants([{ ...grant, revokedAt: grant.startsAt }, grant], grant.startsAt)).toBe("PREMIUM");
    expect(effectivePlanFromGrants([grant], new Date(grant.expiresAt.getTime() - 1))).toBe("PREMIUM");
  });
});

describe("Vietnam calendar billing", () => {
  it("clamps January 31 to February 28, retaining the original billing day on renewal", () => {
    const jan = inVietnam("2027-01-31T08:15:00+07:00");
    const feb = addVietnamCalendarPeriod(jan, "MONTH");
    expect(feb.toISOString()).toBe("2027-02-28T01:15:00.000Z");
    expect(addVietnamCalendarPeriod(feb, "MONTH", 1, 31).toISOString()).toBe("2027-03-31T01:15:00.000Z");
  });
  it("handles leap-day annual renewal without losing the local clock", () => {
    const leap = inVietnam("2024-02-29T22:30:00+07:00");
    expect(addVietnamCalendarPeriod(leap, "YEAR").toISOString()).toBe("2025-02-28T15:30:00.000Z");
    expect(addVietnamCalendarPeriod(leap, "YEAR", 4).toISOString()).toBe("2028-02-29T15:30:00.000Z");
  });
  it("handles month-end 30 and 31, and rejects invalid period counts", () => {
    expect(addVietnamCalendarPeriod(inVietnam("2026-08-30T12:00:00+07:00"), "MONTH").toISOString())
      .toBe("2026-09-30T05:00:00.000Z");
    expect(addVietnamCalendarPeriod(inVietnam("2026-08-31T12:00:00+07:00"), "MONTH").toISOString())
      .toBe("2026-09-30T05:00:00.000Z");
    expect(() => addVietnamCalendarPeriod(new Date(), "MONTH", 0)).toThrow("INVALID_PERIOD_COUNT");
    for (const count of [-1, 1.5, 121, NaN]) {
      expect(() => addVietnamCalendarPeriod(new Date(), "MONTH", count)).toThrow("INVALID_PERIOD_COUNT");
    }
    for (const day of [0, 1.5, 32, NaN]) {
      expect(() => addVietnamCalendarPeriod(new Date(), "MONTH", 1, day)).toThrow("INVALID_ANNIVERSARY_DAY");
    }
    expect(() => addVietnamCalendarPeriod(new Date(NaN), "MONTH")).toThrow("INVALID_START_DATE");
    expect(() => addVietnamCalendarPeriod(new Date(), "WEEK" as "MONTH")).toThrow("INVALID_BILLING_PERIOD");
  });
  it("preserves 28/29 anchor days through non-leap and leap February", () => {
    for (const day of [28, 29] as const) {
      const january = inVietnam(`2028-01-${day}T09:05:00+07:00`);
      const february = addVietnamCalendarPeriod(january, "MONTH");
      expect(february.toISOString()).toBe(`2028-02-${day}T02:05:00.000Z`);
      expect(addVietnamCalendarPeriod(february, "MONTH", 1, day).toISOString())
        .toBe(`2028-03-${day}T02:05:00.000Z`);
    }
    const jan29 = inVietnam("2027-01-29T09:05:00+07:00");
    const feb28 = addVietnamCalendarPeriod(jan29, "MONTH");
    expect(feb28.toISOString()).toBe("2027-02-28T02:05:00.000Z");
    expect(addVietnamCalendarPeriod(feb28, "MONTH", 1, 29).toISOString())
      .toBe("2027-03-29T02:05:00.000Z");
  });
});

describe("verified bank-credit matching", () => {
  const code = `FNV${"A".repeat(20)}`;
  const createdAt = new Date("2026-10-23T08:00:00Z");
  const expiresAt = new Date("2026-10-24T08:00:00Z");
  const order = { receiverAccountId: "receiver-a", amountDueVnd: BigInt(29000),
    currency: "VND", status: "PENDING_PAYMENT", createdAt, expiresAt };
  const incoming = { direction: "IN", receiverAccountId: "receiver-a", amountVnd: BigInt(29000),
    occurredAt: new Date("2026-10-23T09:00:00Z"), order };

  it("accepts precisely one delimited order code", () => {
    expect(extractBillingOrderCode(`Thanh toan ${code} Premium`)).toBe(code);
    expect(extractBillingOrderCode(`prefix${code}`)).toBeNull();
    expect(extractBillingOrderCode(`${code}suffix`)).toBeNull();
    expect(extractBillingOrderCode(`${code} ${code}`)).toBeNull();
    expect(extractBillingOrderCode("FNVinvalid" )).toBeNull();
    expect(extractBillingOrderCode("" )).toBeNull();
    expect(extractBillingOrderCode(null as unknown as string)).toBeNull();
    expect(extractBillingOrderCode(0 as unknown as string)).toBeNull();
  });
  it("requires direction, receiver, amount, correct status and valid payment time", () => {
    expect(classifyVerifiedBankCredit(incoming)).toBe("MATCHED");
    expect(classifyVerifiedBankCredit({ ...incoming, direction: "OUT" })).toBe("REVIEW_DIRECTION");
    expect(classifyVerifiedBankCredit({ ...incoming, receiverAccountId: "receiver-b" })).toBe("REVIEW_RECEIVER");
    expect(classifyVerifiedBankCredit({ ...incoming, amountVnd: BigInt(199000) })).toBe("REVIEW_AMOUNT");
    for (const amountVnd of [BigInt(0), BigInt(-1)]) {
      expect(classifyVerifiedBankCredit({ ...incoming, amountVnd })).toBe("REVIEW_AMOUNT");
      expect(classifyVerifiedBankCredit({ ...incoming, amountVnd, order: { ...order, amountDueVnd: amountVnd } })).toBe("REVIEW_AMOUNT");
    }
    expect(classifyVerifiedBankCredit({ ...incoming, order: null })).toBe("UNMATCHED");
    expect(classifyVerifiedBankCredit({ ...incoming, order: { ...order, status: "PAID" } })).toBe("REVIEW_ORDER_STATUS");
    for (const status of ["EXPIRED", "REFUNDED", "CANCELLED", "REVIEW_REQUIRED"] as const) {
      expect(classifyVerifiedBankCredit({ ...incoming, order: { ...order, status } })).toBe("REVIEW_ORDER_STATUS");
    }
    expect(classifyVerifiedBankCredit({ ...incoming, occurredAt: new Date(createdAt.getTime() - 1) })).toBe("REVIEW_TIMING");
    expect(classifyVerifiedBankCredit({ ...incoming, occurredAt: createdAt })).toBe("MATCHED");
    expect(classifyVerifiedBankCredit({ ...incoming, occurredAt: new Date(NaN) })).toBe("REVIEW_TIMING");
    expect(classifyVerifiedBankCredit({ ...incoming, order: { ...order, expiresAt: createdAt } })).toBe("REVIEW_TIMING");
    expect(classifyVerifiedBankCredit({ ...incoming, occurredAt: new Date(expiresAt.getTime() + 1) })).toBe("LATE_PAYMENT_REVIEW");
    expect(classifyVerifiedBankCredit({ ...incoming, occurredAt: expiresAt })).toBe("LATE_PAYMENT_REVIEW");
  });

  it("holds corrupt order timestamps for manual review instead of granting Premium", () => {
    expect(classifyVerifiedBankCredit({ ...incoming, order: {
      ...order, createdAt: new Date(NaN),
    } })).toBe("REVIEW_TIMING");
    expect(classifyVerifiedBankCredit({ ...incoming, order: {
      ...order, expiresAt: new Date(NaN),
    } })).toBe("REVIEW_TIMING");
    expect(classifyVerifiedBankCredit({ ...incoming, order: {
      ...order, expiresAt: new Date(createdAt.getTime() - 1),
    } })).toBe("REVIEW_TIMING");
  });
});
