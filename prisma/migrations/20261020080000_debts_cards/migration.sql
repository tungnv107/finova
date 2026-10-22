-- P5: additive ledger-backed debt and credit-card records. No destructive DDL.
CREATE TYPE "DebtDirection" AS ENUM ('BORROW', 'LEND');
CREATE TYPE "CardEntryKind" AS ENUM ('PURCHASE', 'REFUND', 'PAYMENT');

CREATE UNIQUE INDEX "LedgerAccount_workspaceId_id_key" ON "LedgerAccount"("workspaceId", "id");
CREATE UNIQUE INDEX "Journal_workspaceId_id_key" ON "Journal"("workspaceId", "id");

CREATE TABLE "DebtContract" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "ledgerAccountId" TEXT NOT NULL,
  "originationJournalId" TEXT NOT NULL,
  "direction" "DebtDirection" NOT NULL,
  "counterparty" TEXT NOT NULL,
  "principal" DECIMAL(20,4) NOT NULL,
  "annualRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "installmentCount" INTEGER NOT NULL DEFAULT 1,
  "startAt" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3),
  "note" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DebtContract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DebtContract_principal_positive" CHECK ("principal" > 0),
  CONSTRAINT "DebtContract_rate_valid" CHECK ("annualRate" >= 0 AND "annualRate" <= 100),
  CONSTRAINT "DebtContract_installments_positive" CHECK ("installmentCount" BETWEEN 1 AND 360),
  CONSTRAINT "DebtContract_due_after_start" CHECK ("dueAt" IS NULL OR "dueAt" >= "startAt")
);
CREATE UNIQUE INDEX "DebtContract_workspaceId_id_key" ON "DebtContract"("workspaceId", "id");
CREATE UNIQUE INDEX "DebtContract_ledgerAccountId_key" ON "DebtContract"("ledgerAccountId");
CREATE UNIQUE INDEX "DebtContract_originationJournalId_key" ON "DebtContract"("originationJournalId");
CREATE INDEX "DebtContract_workspaceId_direction_dueAt_idx" ON "DebtContract"("workspaceId","direction","dueAt");

CREATE TABLE "DebtPayment" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "debtId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "journalId" TEXT NOT NULL,
  "principal" DECIMAL(20,4) NOT NULL,
  "interest" DECIMAL(20,4) NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DebtPayment_positive" CHECK ("principal" >= 0 AND "interest" >= 0 AND "principal" + "interest" > 0)
);
CREATE UNIQUE INDEX "DebtPayment_journalId_key" ON "DebtPayment"("journalId");
CREATE UNIQUE INDEX "DebtPayment_workspaceId_idempotencyKey_key" ON "DebtPayment"("workspaceId", "idempotencyKey");
CREATE INDEX "DebtPayment_workspaceId_debtId_effectiveAt_idx" ON "DebtPayment"("workspaceId","debtId","effectiveAt");

CREATE TABLE "CreditCard" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ledgerAccountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lastFour" TEXT,
  "creditLimit" DECIMAL(20,4) NOT NULL,
  "openingDebt" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "statementDay" INTEGER NOT NULL,
  "paymentDueDay" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditCard_limit_positive" CHECK ("creditLimit" > 0),
  CONSTRAINT "CreditCard_opening_valid" CHECK ("openingDebt" >= 0 AND "openingDebt" <= "creditLimit"),
  CONSTRAINT "CreditCard_statement_valid" CHECK ("statementDay" BETWEEN 1 AND 28),
  CONSTRAINT "CreditCard_due_valid" CHECK ("paymentDueDay" BETWEEN 1 AND 28),
  CONSTRAINT "CreditCard_last_four" CHECK ("lastFour" IS NULL OR "lastFour" ~ '^[0-9]{4}$')
);
CREATE UNIQUE INDEX "CreditCard_workspaceId_id_key" ON "CreditCard"("workspaceId", "id");
CREATE UNIQUE INDEX "CreditCard_ledgerAccountId_key" ON "CreditCard"("ledgerAccountId");
CREATE INDEX "CreditCard_workspaceId_name_idx" ON "CreditCard"("workspaceId", "name");

CREATE TABLE "CardEntry" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "kind" "CardEntryKind" NOT NULL,
  "amount" DECIMAL(20,4) NOT NULL,
  "walletId" TEXT,
  "categoryId" TEXT,
  "originalEntryId" TEXT,
  "journalId" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "note" VARCHAR(300),
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CardEntry_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "CardEntry_shape" CHECK (
    ("kind" = 'PURCHASE' AND "walletId" IS NULL AND "categoryId" IS NOT NULL AND "originalEntryId" IS NULL)
    OR ("kind" = 'REFUND' AND "walletId" IS NULL AND "categoryId" IS NOT NULL AND "originalEntryId" IS NOT NULL)
    OR ("kind" = 'PAYMENT' AND "walletId" IS NOT NULL AND "categoryId" IS NULL AND "originalEntryId" IS NULL)
  )
);
CREATE UNIQUE INDEX "CardEntry_workspaceId_id_key" ON "CardEntry"("workspaceId", "id");
CREATE UNIQUE INDEX "CardEntry_journalId_key" ON "CardEntry"("journalId");
CREATE UNIQUE INDEX "CardEntry_workspaceId_idempotencyKey_key" ON "CardEntry"("workspaceId", "idempotencyKey");
CREATE INDEX "CardEntry_workspaceId_cardId_effectiveAt_idx" ON "CardEntry"("workspaceId","cardId","effectiveAt");

ALTER TABLE "DebtContract" ADD CONSTRAINT "DebtContract_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtContract" ADD CONSTRAINT "DebtContract_workspaceId_walletId_fkey" FOREIGN KEY ("workspaceId","walletId") REFERENCES "Wallet"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DebtContract" ADD CONSTRAINT "DebtContract_workspaceId_ledgerAccountId_fkey" FOREIGN KEY ("workspaceId","ledgerAccountId") REFERENCES "LedgerAccount"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DebtContract" ADD CONSTRAINT "DebtContract_workspaceId_originationJournalId_fkey" FOREIGN KEY ("workspaceId","originationJournalId") REFERENCES "Journal"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_workspaceId_debtId_fkey" FOREIGN KEY ("workspaceId","debtId") REFERENCES "DebtContract"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_workspaceId_walletId_fkey" FOREIGN KEY ("workspaceId","walletId") REFERENCES "Wallet"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_workspaceId_journalId_fkey" FOREIGN KEY ("workspaceId","journalId") REFERENCES "Journal"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_workspaceId_ledgerAccountId_fkey" FOREIGN KEY ("workspaceId","ledgerAccountId") REFERENCES "LedgerAccount"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardEntry" ADD CONSTRAINT "CardEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardEntry" ADD CONSTRAINT "CardEntry_workspaceId_cardId_fkey" FOREIGN KEY ("workspaceId","cardId") REFERENCES "CreditCard"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardEntry" ADD CONSTRAINT "CardEntry_workspaceId_walletId_fkey" FOREIGN KEY ("workspaceId","walletId") REFERENCES "Wallet"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardEntry" ADD CONSTRAINT "CardEntry_workspaceId_categoryId_fkey" FOREIGN KEY ("workspaceId","categoryId") REFERENCES "Category"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardEntry" ADD CONSTRAINT "CardEntry_workspaceId_originalEntryId_fkey" FOREIGN KEY ("workspaceId","originalEntryId") REFERENCES "CardEntry"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardEntry" ADD CONSTRAINT "CardEntry_workspaceId_journalId_fkey" FOREIGN KEY ("workspaceId","journalId") REFERENCES "Journal"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
