-- Additive, non-destructive workspace-scoped foreign keys.
-- These pairs ensure referenced wallets/categories/refunds belong to the same workspace.
CREATE UNIQUE INDEX "Wallet_workspaceId_id_key" ON "Wallet"("workspaceId", "id");
CREATE UNIQUE INDEX "Category_workspaceId_id_key" ON "Category"("workspaceId", "id");
CREATE UNIQUE INDEX "Transaction_workspaceId_id_key" ON "Transaction"("workspaceId", "id");

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_workspaceId_walletId_fkey"
  FOREIGN KEY ("workspaceId", "walletId") REFERENCES "Wallet"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_workspaceId_destinationWalletId_fkey"
  FOREIGN KEY ("workspaceId", "destinationWalletId") REFERENCES "Wallet"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_workspaceId_categoryId_fkey"
  FOREIGN KEY ("workspaceId", "categoryId") REFERENCES "Category"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_workspaceId_originalTransactionId_fkey"
  FOREIGN KEY ("workspaceId", "originalTransactionId") REFERENCES "Transaction"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
