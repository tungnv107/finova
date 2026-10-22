-- CreateTable
CREATE TABLE "bank_providers" (
    "code" VARCHAR(60) NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "capabilitiesJson" JSONB NOT NULL,
    "configVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "bank_providers_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "bank_connections" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "providerConnectionRef" VARCHAR(200),
    "status" TEXT NOT NULL DEFAULT 'PAUSED',
    "postingPolicy" TEXT NOT NULL DEFAULT 'HYBRID',
    "consentExpiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "cutoverAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "credentialRef" TEXT,
    "pollCursor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_consents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "scopeJson" JSONB NOT NULL,
    "purposeVersion" TEXT NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "bank_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerAccountRef" VARCHAR(200) NOT NULL,
    "bankCode" TEXT,
    "accountMasked" VARCHAR(40) NOT NULL,
    "accountIdentifierHash" VARCHAR(64),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "walletId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_raw_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalEventId" VARCHAR(200) NOT NULL,
    "payloadCiphertext" TEXT NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryCount" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,

    CONSTRAINT "bank_raw_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "rawEventId" TEXT,
    "externalTransactionId" VARCHAR(200),
    "bankReference" VARCHAR(200),
    "direction" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "bookedAt" TIMESTAMP(3),
    "descriptionRaw" TEXT NOT NULL,
    "runningBalance" DECIMAL(20,4),
    "bookingStatus" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'STAGED',
    "fingerprint" VARCHAR(64) NOT NULL,
    "sourceVersion" TEXT NOT NULL DEFAULT '1',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transaction_links" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transaction_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_review_items" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "suggestionJson" JSONB,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_audit_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadataRedactedJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_sync_outbox" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_sync_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_sync_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fromAt" TIMESTAMP(3),
    "toAt" TIMESTAMP(3),
    "cursor" TEXT,
    "metricsJson" JSONB,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "bank_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliation_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "asOfAt" TIMESTAMP(3) NOT NULL,
    "balanceType" TEXT NOT NULL,
    "bankBalance" DECIMAL(20,4) NOT NULL,
    "ledgerBalance" DECIMAL(20,4) NOT NULL,
    "delta" DECIMAL(20,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliation_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_category_rules" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditionsJson" JSONB NOT NULL,
    "categoryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_connections_workspaceId_status_idx" ON "bank_connections"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_connections_workspaceId_id_key" ON "bank_connections"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "bank_consents_connectionId_revokedAt_idx" ON "bank_consents"("connectionId", "revokedAt");

-- CreateIndex
CREATE INDEX "bank_accounts_workspaceId_walletId_idx" ON "bank_accounts"("workspaceId", "walletId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_workspaceId_id_key" ON "bank_accounts"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_connectionId_providerAccountRef_key" ON "bank_accounts"("connectionId", "providerAccountRef");

-- CreateIndex
CREATE INDEX "bank_raw_events_processingStatus_receivedAt_idx" ON "bank_raw_events"("processingStatus", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bank_raw_events_providerCode_connectionId_externalEventId_key" ON "bank_raw_events"("providerCode", "connectionId", "externalEventId");

-- CreateIndex
CREATE INDEX "bank_transactions_workspaceId_occurredAt_idx" ON "bank_transactions"("workspaceId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "bank_transactions_bankAccountId_bookedAt_idx" ON "bank_transactions"("bankAccountId", "bookedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_workspaceId_id_key" ON "bank_transactions"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_bankAccountId_externalTransactionId_key" ON "bank_transactions"("bankAccountId", "externalTransactionId");

-- CreateIndex
CREATE INDEX "bank_transaction_links_workspaceId_transactionId_idx" ON "bank_transaction_links"("workspaceId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transaction_links_bankTransactionId_transactionId_key" ON "bank_transaction_links"("bankTransactionId", "transactionId");

-- CreateIndex
CREATE INDEX "bank_review_items_workspaceId_status_createdAt_idx" ON "bank_review_items"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bank_review_items_bankTransactionId_reasonCode_key" ON "bank_review_items"("bankTransactionId", "reasonCode");

-- CreateIndex
CREATE INDEX "bank_audit_events_workspaceId_occurredAt_idx" ON "bank_audit_events"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "bank_sync_outbox_status_nextAttemptAt_idx" ON "bank_sync_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "bank_sync_outbox_eventType_aggregateId_key" ON "bank_sync_outbox"("eventType", "aggregateId");

-- CreateIndex
CREATE INDEX "bank_sync_jobs_connectionId_status_idx" ON "bank_sync_jobs"("connectionId", "status");

-- CreateIndex
CREATE INDEX "bank_reconciliation_snapshots_workspaceId_bankAccountId_asO_idx" ON "bank_reconciliation_snapshots"("workspaceId", "bankAccountId", "asOfAt");

-- CreateIndex
CREATE INDEX "bank_category_rules_workspaceId_enabled_priority_idx" ON "bank_category_rules"("workspaceId", "enabled", "priority");

-- AddForeignKey
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_providerCode_fkey" FOREIGN KEY ("providerCode") REFERENCES "bank_providers"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_consents" ADD CONSTRAINT "bank_consents_workspaceId_connectionId_fkey" FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "bank_connections"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_workspaceId_connectionId_fkey" FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "bank_connections"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_workspaceId_walletId_fkey" FOREIGN KEY ("workspaceId", "walletId") REFERENCES "Wallet"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_raw_events" ADD CONSTRAINT "bank_raw_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_raw_events" ADD CONSTRAINT "bank_raw_events_providerCode_fkey" FOREIGN KEY ("providerCode") REFERENCES "bank_providers"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_raw_events" ADD CONSTRAINT "bank_raw_events_workspaceId_connectionId_fkey" FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "bank_connections"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_workspaceId_bankAccountId_fkey" FOREIGN KEY ("workspaceId", "bankAccountId") REFERENCES "bank_accounts"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_rawEventId_fkey" FOREIGN KEY ("rawEventId") REFERENCES "bank_raw_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_links" ADD CONSTRAINT "bank_transaction_links_workspaceId_bankTransactionId_fkey" FOREIGN KEY ("workspaceId", "bankTransactionId") REFERENCES "bank_transactions"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_links" ADD CONSTRAINT "bank_transaction_links_workspaceId_transactionId_fkey" FOREIGN KEY ("workspaceId", "transactionId") REFERENCES "Transaction"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_review_items" ADD CONSTRAINT "bank_review_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_review_items" ADD CONSTRAINT "bank_review_items_workspaceId_bankTransactionId_fkey" FOREIGN KEY ("workspaceId", "bankTransactionId") REFERENCES "bank_transactions"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_audit_events" ADD CONSTRAINT "bank_audit_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_sync_jobs" ADD CONSTRAINT "bank_sync_jobs_workspaceId_connectionId_fkey" FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "bank_connections"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
