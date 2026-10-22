CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW','COMPLETE');
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID','INVALID','DUPLICATE','IMPORTED','FAILED');
CREATE TABLE "ImportBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "fileName" VARCHAR(200) NOT NULL,
  "fileHash" VARCHAR(64) NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ImportBatch_workspaceId_id_key" ON "ImportBatch"("workspaceId","id");
CREATE INDEX "ImportBatch_workspaceId_createdAt_idx" ON "ImportBatch"("workspaceId","createdAt");
CREATE TABLE "ImportRow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "sourceHash" VARCHAR(64) NOT NULL,
  "kind" "TransactionKind",
  "walletId" TEXT,
  "categoryId" TEXT,
  "destinationWalletId" TEXT,
  "amount" DECIMAL(20,4),
  "occurredAt" TIMESTAMP(3),
  "note" VARCHAR(1000),
  "status" "ImportRowStatus" NOT NULL,
  "error" VARCHAR(500),
  "transactionId" TEXT,
  CONSTRAINT "ImportRow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "ImportRow_batch_fkey" FOREIGN KEY ("workspaceId","batchId") REFERENCES "ImportBatch"("workspaceId","id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ImportRow_batchId_rowNumber_key" ON "ImportRow"("batchId","rowNumber");
CREATE INDEX "ImportRow_workspaceId_sourceHash_status_idx" ON "ImportRow"("workspaceId","sourceHash","status");
CREATE INDEX "ImportRow_batchId_status_idx" ON "ImportRow"("batchId","status");
