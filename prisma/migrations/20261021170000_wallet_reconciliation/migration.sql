CREATE TABLE "WalletReconciliation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expectedBalance" DECIMAL(20,4) NOT NULL,
    "actualBalance" DECIMAL(20,4) NOT NULL,
    "delta" DECIMAL(20,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "journalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletReconciliation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WalletReconciliation_integer_amounts" CHECK (
        "expectedBalance" = TRUNC("expectedBalance") AND
        "actualBalance" = TRUNC("actualBalance") AND
        "delta" = TRUNC("delta") AND
        "delta" = "actualBalance" - "expectedBalance" AND
        "actualBalance" >= 0
    )
);
CREATE UNIQUE INDEX "WalletReconciliation_workspaceId_idempotencyKey_key" ON "WalletReconciliation"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "WalletReconciliation_journalId_key" ON "WalletReconciliation"("journalId");
CREATE INDEX "WalletReconciliation_workspaceId_walletId_createdAt_idx" ON "WalletReconciliation"("workspaceId", "walletId", "createdAt" DESC);
ALTER TABLE "WalletReconciliation" ADD CONSTRAINT "WalletReconciliation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletReconciliation" ADD CONSTRAINT "WalletReconciliation_workspaceId_walletId_fkey" FOREIGN KEY ("workspaceId", "walletId") REFERENCES "Wallet"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletReconciliation" ADD CONSTRAINT "WalletReconciliation_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
