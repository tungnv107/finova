CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionEvent_kind_check" CHECK ("kind" IN ('GRANT_ACTIVATED', 'GRANT_REVOKED'))
);

CREATE UNIQUE INDEX "SubscriptionEvent_grantId_kind_key" ON "SubscriptionEvent"("grantId", "kind");
CREATE UNIQUE INDEX "SubscriptionEvent_orderId_kind_key" ON "SubscriptionEvent"("orderId", "kind");
CREATE INDEX "SubscriptionEvent_userId_createdAt_idx" ON "SubscriptionEvent"("userId", "createdAt");

ALTER TABLE "SubscriptionEvent"
    ADD CONSTRAINT "SubscriptionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SubscriptionEvent_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "SubscriptionGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SubscriptionEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BillingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the activation history of any valid bank-payment grants created before
-- the domain-event model was introduced (including staging/pilot test grants).
INSERT INTO "SubscriptionEvent"
  ("id", "userId", "grantId", "orderId", "kind", "startsAt", "expiresAt", "createdAt")
SELECT
  'grant-activation-' || g."id", g."userId", g."id", g."orderId",
  'GRANT_ACTIVATED', g."startsAt", g."expiresAt", g."createdAt"
FROM "SubscriptionGrant" g
WHERE g."orderId" IS NOT NULL AND g."grantType" = 'BANK_PAYMENT';
