CREATE TABLE "SubscriptionActionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "grantId" TEXT,
  "billingPeriod" "BillingPeriod",
  "periodCount" INTEGER,
  "reason" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reviewedBy" TEXT,
  "reviewReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionActionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionActionRequest_kind_check" CHECK (
    ("kind" = 'MANUAL_GRANT' AND "grantId" IS NULL AND "billingPeriod" IS NOT NULL AND "periodCount" = 1)
    OR ("kind" = 'REVOKE_MANUAL' AND "grantId" IS NOT NULL AND "billingPeriod" IS NULL AND "periodCount" IS NULL)
  ),
  CONSTRAINT "SubscriptionActionRequest_status_check" CHECK (
    "status" IN ('PENDING', 'APPROVED', 'REJECTED')
  ),
  CONSTRAINT "SubscriptionActionRequest_reason_check" CHECK (length(trim("reason")) BETWEEN 12 AND 500),
  CONSTRAINT "SubscriptionActionRequest_review_check" CHECK (
    ("status" = 'PENDING' AND "reviewedBy" IS NULL AND "reviewedAt" IS NULL AND "reviewReason" IS NULL)
    OR ("status" <> 'PENDING' AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewedBy" <> "requestedBy" AND "reviewReason" IS NOT NULL AND length(trim("reviewReason")) BETWEEN 12 AND 500)
  ),
  CONSTRAINT "SubscriptionActionRequest_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "SubscriptionActionRequest_requestedBy_idempotencyKey_key" ON "SubscriptionActionRequest"("requestedBy", "idempotencyKey");
CREATE INDEX "SubscriptionActionRequest_status_createdAt_idx" ON "SubscriptionActionRequest"("status", "createdAt");
CREATE INDEX "SubscriptionActionRequest_userId_createdAt_idx" ON "SubscriptionActionRequest"("userId", "createdAt");
ALTER TABLE "SubscriptionActionRequest" ADD CONSTRAINT "SubscriptionActionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionActionRequest" ADD CONSTRAINT "SubscriptionActionRequest_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "SubscriptionGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionEvent" ADD COLUMN "actionRequestId" TEXT;
ALTER TABLE "SubscriptionEvent" ADD COLUMN "actorId" TEXT;
ALTER TABLE "SubscriptionEvent" ADD COLUMN "reason" TEXT;
ALTER TABLE "SubscriptionEvent" DROP CONSTRAINT "SubscriptionEvent_kind_check";
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_kind_check" CHECK ("kind" IN ('GRANT_ACTIVATED', 'MANUAL_ACTIVATED', 'GRANT_REVOKED'));
CREATE UNIQUE INDEX "SubscriptionEvent_actionRequestId_key" ON "SubscriptionEvent"("actionRequestId");
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_actionRequestId_fkey" FOREIGN KEY ("actionRequestId") REFERENCES "SubscriptionActionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
