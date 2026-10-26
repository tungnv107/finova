-- The canonical verified payment event acts as the durable reconciliation inbox/job.
-- It is committed before webhook ACK. Keep raw ingress archive/polling as a separate release gate.
ALTER TABLE "BillingOrder"
  ADD CONSTRAINT "BillingOrder_amount_positive_check" CHECK ("amountDueVnd" > 0),
  ADD CONSTRAINT "BillingOrder_period_count_check" CHECK ("periodCountSnapshot" BETWEEN 1 AND 120),
  ADD CONSTRAINT "BillingOrder_currency_check" CHECK ("currency" = 'VND'),
  ADD CONSTRAINT "BillingOrder_expiry_check" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "BillingPaymentEvent"
  ADD CONSTRAINT "BillingPaymentEvent_amount_positive_check" CHECK ("amountVnd" > 0),
  ADD CONSTRAINT "BillingPaymentEvent_direction_check" CHECK ("direction" IN ('IN', 'OUT')),
  ADD CONSTRAINT "BillingPaymentEvent_verification_check" CHECK ("verificationStatus" = 'VERIFIED'),
  ADD CONSTRAINT "BillingPaymentEvent_match_status_check" CHECK (
    "matchStatus" IN ('RECEIVED', 'MATCHED', 'UNMATCHED', 'REVIEW_AMOUNT',
      'REVIEW_RECEIVER', 'REVIEW_DIRECTION', 'LATE_PAYMENT_REVIEW',
      'REVIEW_ORDER_STATUS', 'REVIEW_TIMING')
  ),
  ADD CONSTRAINT "BillingPaymentEvent_attempt_count_check" CHECK ("attemptCount" >= 0),
  ADD CONSTRAINT "BillingPaymentEvent_lease_pair_check" CHECK (
    ("leaseOwner" IS NULL AND "leaseUntil" IS NULL) OR
    ("leaseOwner" IS NOT NULL AND "leaseUntil" IS NOT NULL)
  );

ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_amount_positive_check" CHECK ("amountVnd" > 0);
