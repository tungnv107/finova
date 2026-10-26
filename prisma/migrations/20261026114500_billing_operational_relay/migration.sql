CREATE TABLE "BillingOperationalRelay" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "incidentId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "phase" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "deadLetterAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingOperationalRelay_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "BillingOperationalIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BillingOperationalRelay_phase_check" CHECK ("phase" IN ('PRIMARY','ESCALATION')),
  CONSTRAINT "BillingOperationalRelay_state_check" CHECK ("state" IN ('PENDING','DELIVERED','DEAD','CANCELLED')),
  CONSTRAINT "BillingOperationalRelay_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "BillingOperationalRelay_incidentId_generation_phase_key"
  ON "BillingOperationalRelay"("incidentId", "generation", "phase");
CREATE INDEX "BillingOperationalRelay_state_nextAttemptAt_idx"
  ON "BillingOperationalRelay"("state", "nextAttemptAt");
