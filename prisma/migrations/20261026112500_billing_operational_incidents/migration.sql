CREATE TABLE "BillingOperationalIncident" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'OPEN',
  "generation" INTEGER NOT NULL DEFAULT 1,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "escalatedAt" TIMESTAMP(3),
  CONSTRAINT "BillingOperationalIncident_state_check" CHECK ("state" IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  CONSTRAINT "BillingOperationalIncident_severity_check" CHECK ("severity" IN ('critical','warning','info')),
  CONSTRAINT "BillingOperationalIncident_count_check" CHECK ("count" > 0),
  CONSTRAINT "BillingOperationalIncident_generation_check" CHECK ("generation" > 0)
);
CREATE UNIQUE INDEX "BillingOperationalIncident_code_key" ON "BillingOperationalIncident"("code");
CREATE INDEX "BillingOperationalIncident_state_openedAt_idx" ON "BillingOperationalIncident"("state", "openedAt");

CREATE TABLE "BillingOperationalDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "incidentId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "BillingOperationalDelivery_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "BillingOperationalIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BillingOperationalDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BillingOperationalDelivery_incidentId_generation_userId_key" ON "BillingOperationalDelivery"("incidentId", "generation", "userId");
CREATE INDEX "BillingOperationalDelivery_userId_deliveredAt_idx" ON "BillingOperationalDelivery"("userId", "deliveredAt" DESC);

CREATE TABLE "BillingOperationalHistory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "incidentId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingOperationalHistory_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "BillingOperationalIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BillingOperationalHistory_action_check" CHECK ("action" IN ('OPENED','REOPENED','ACKNOWLEDGED','RESOLVED','ESCALATED'))
);
CREATE INDEX "BillingOperationalHistory_incidentId_at_idx" ON "BillingOperationalHistory"("incidentId", "at");

CREATE TABLE "BillingProviderProbe" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "checkedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  CONSTRAINT "BillingProviderProbe_status_check" CHECK ("status" IN ('UNKNOWN','HEALTHY','UNREACHABLE')),
  CONSTRAINT "BillingProviderProbe_failures_check" CHECK ("consecutiveFailures" >= 0)
);
