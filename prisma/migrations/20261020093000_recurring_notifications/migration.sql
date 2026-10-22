-- P6: append-only recurring schedule and in-app notification data.
CREATE TYPE "RecurringFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE "RecurringMode" AS ENUM ('CONFIRM', 'AUTO');
CREATE TYPE "RecurringStatus" AS ENUM ('PENDING', 'PROCESSING', 'POSTED', 'SKIPPED');

CREATE TABLE "RecurringRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "frequency" "RecurringFrequency" NOT NULL,
  "interval" INTEGER NOT NULL DEFAULT 1,
  "mode" "RecurringMode" NOT NULL DEFAULT 'CONFIRM',
  "kind" "TransactionKind" NOT NULL,
  "walletId" TEXT NOT NULL,
  "destinationWalletId" TEXT,
  "categoryId" TEXT,
  "amount" DECIMAL(20,4) NOT NULL,
  "note" VARCHAR(1000),
  "startDate" VARCHAR(10) NOT NULL,
  "endDate" VARCHAR(10),
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "RecurringRule_amount_positive" CHECK ("amount" > 0 AND "amount" = trunc("amount")),
  CONSTRAINT "RecurringRule_interval_valid" CHECK ("interval" BETWEEN 1 AND 365),
  CONSTRAINT "RecurringRule_kind_valid" CHECK ("kind" IN ('INCOME','EXPENSE','TRANSFER')),
  CONSTRAINT "RecurringRule_dates_valid" CHECK ("endDate" IS NULL OR "endDate" >= "startDate")
);
CREATE UNIQUE INDEX "RecurringRule_workspaceId_id_key" ON "RecurringRule"("workspaceId","id");
CREATE INDEX "RecurringRule_workspaceId_paused_idx" ON "RecurringRule"("workspaceId","paused");

CREATE TABLE "RecurringOccurrence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "periodKey" VARCHAR(10) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" "RecurringStatus" NOT NULL DEFAULT 'PENDING',
  "transactionId" TEXT,
  "processingAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringOccurrence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "RecurringOccurrence_rule_fkey" FOREIGN KEY ("workspaceId","ruleId") REFERENCES "RecurringRule"("workspaceId","id") ON DELETE RESTRICT,
  CONSTRAINT "RecurringOccurrence_transaction_fkey" FOREIGN KEY ("workspaceId","transactionId") REFERENCES "Transaction"("workspaceId","id") ON DELETE RESTRICT,
  CONSTRAINT "RecurringOccurrence_posted_has_transaction" CHECK (("status" = 'POSTED') = ("transactionId" IS NOT NULL))
);
CREATE UNIQUE INDEX "RecurringOccurrence_ruleId_periodKey_key" ON "RecurringOccurrence"("ruleId","periodKey");
CREATE UNIQUE INDEX "RecurringOccurrence_workspaceId_id_key" ON "RecurringOccurrence"("workspaceId","id");
CREATE UNIQUE INDEX "RecurringOccurrence_transactionId_key" ON "RecurringOccurrence"("transactionId");
CREATE INDEX "RecurringOccurrence_workspaceId_status_dueAt_idx" ON "RecurringOccurrence"("workspaceId","status","dueAt");

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "key" VARCHAR(200) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "link" VARCHAR(200),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Notification_workspaceId_key_key" ON "Notification"("workspaceId","key");
CREATE INDEX "Notification_workspaceId_readAt_createdAt_idx" ON "Notification"("workspaceId","readAt","createdAt");
