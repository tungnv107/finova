CREATE TABLE "BillingOutbox" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "deadLetteredAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingNotice" (
    "id" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingOutbox_orderId_key" ON "BillingOutbox"("orderId");
CREATE INDEX "BillingOutbox_status_deadLetteredAt_nextAttemptAt_idx" ON "BillingOutbox"("status", "deadLetteredAt", "nextAttemptAt");
CREATE UNIQUE INDEX "BillingNotice_outboxId_key" ON "BillingNotice"("outboxId");
CREATE INDEX "BillingNotice_userId_createdAt_idx" ON "BillingNotice"("userId", "createdAt");
ALTER TABLE "BillingOutbox" ADD CONSTRAINT "BillingOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BillingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingNotice" ADD CONSTRAINT "BillingNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
