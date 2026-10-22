-- Each bank evidence row can justify only one Finova ledger transaction.
CREATE UNIQUE INDEX "bank_transaction_links_bankTransactionId_key"
  ON "bank_transaction_links" ("bankTransactionId");

-- One active bank source per wallet; paused/revoked connections retain their
-- mapping until explicitly deactivated (to avoid silent double counting).
CREATE UNIQUE INDEX "bank_accounts_one_active_wallet_key"
  ON "bank_accounts" ("workspaceId", "walletId")
  WHERE "walletId" IS NOT NULL AND "status" = 'ACTIVE';

-- Prevent reconciliation and category rules from referencing other tenants.
ALTER TABLE "bank_reconciliation_snapshots"
  ADD CONSTRAINT "bank_reconciliation_snapshots_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_reconciliation_snapshots_workspaceId_bankAccountId_fkey"
    FOREIGN KEY ("workspaceId", "bankAccountId") REFERENCES "bank_accounts"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bank_category_rules"
  ADD CONSTRAINT "bank_category_rules_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_category_rules_workspaceId_categoryId_fkey"
    FOREIGN KEY ("workspaceId", "categoryId") REFERENCES "Category"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
