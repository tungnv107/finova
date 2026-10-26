ALTER TABLE "BillingPaymentEvent"
    ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "leaseOwner" TEXT,
    ADD COLUMN "leaseUntil" TIMESTAMP(3),
    ADD COLUMN "deadLetteredAt" TIMESTAMP(3),
    ADD COLUMN "lastErrorCode" TEXT;

CREATE INDEX "BillingPaymentEvent_provider_verificationStatus_matchStatus_deadLetteredAt_nextAttemptAt_idx"
    ON "BillingPaymentEvent"("provider", "verificationStatus", "matchStatus", "deadLetteredAt", "nextAttemptAt");
