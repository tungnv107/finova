-- Keep durable billing notices linked to an actual paid-order event.
ALTER TABLE "BillingOutbox"
  ADD CONSTRAINT "BillingOutbox_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingNotice"
  ADD CONSTRAINT "BillingNotice_outboxId_fkey" FOREIGN KEY ("outboxId")
  REFERENCES "BillingOutbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingNotice_orderId_fkey" FOREIGN KEY ("orderId")
  REFERENCES "BillingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "BillingNotice_orderId_key" ON "BillingNotice"("orderId");

ALTER TABLE "BillingOutbox"
  ADD CONSTRAINT "BillingOutbox_status_check" CHECK ("status" IN ('PENDING', 'DELIVERED')),
  ADD CONSTRAINT "BillingOutbox_kind_check" CHECK ("kind" = 'PREMIUM_ACTIVATED'),
  ADD CONSTRAINT "BillingOutbox_attemptCount_check" CHECK ("attemptCount" >= 0),
  ADD CONSTRAINT "BillingOutbox_deliveredAt_check"
    CHECK (("status" = 'PENDING' AND "deliveredAt" IS NULL) OR
           ("status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL));

ALTER TABLE "BillingNotice"
  ADD CONSTRAINT "BillingNotice_kind_check" CHECK ("kind" = 'PREMIUM_ACTIVATED');
