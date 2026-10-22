-- P5: immutable wallet-backed earmarking events, additive migration only.
CREATE TYPE "GoalAllocationKind" AS ENUM ('ALLOCATE', 'RELEASE');
CREATE TABLE "SavingsGoal" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "target" DECIMAL(20,4) NOT NULL,
  "dueAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavingsGoal_positive_target" CHECK ("target" > 0)
);
CREATE TABLE "GoalAllocation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "kind" "GoalAllocationKind" NOT NULL,
  "amount" DECIMAL(20,4) NOT NULL,
  "note" VARCHAR(300),
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "GoalAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoalAllocation_positive_amount" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "SavingsGoal_workspaceId_id_key" ON "SavingsGoal"("workspaceId","id");
CREATE INDEX "SavingsGoal_workspaceId_archivedAt_idx" ON "SavingsGoal"("workspaceId","archivedAt");
CREATE INDEX "SavingsGoal_workspaceId_walletId_idx" ON "SavingsGoal"("workspaceId","walletId");
CREATE UNIQUE INDEX "GoalAllocation_workspaceId_idempotencyKey_key" ON "GoalAllocation"("workspaceId","idempotencyKey");
CREATE INDEX "GoalAllocation_workspaceId_goalId_createdAt_idx" ON "GoalAllocation"("workspaceId","goalId","createdAt");
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_workspaceId_walletId_fkey" FOREIGN KEY ("workspaceId","walletId") REFERENCES "Wallet"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoalAllocation" ADD CONSTRAINT "GoalAllocation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalAllocation" ADD CONSTRAINT "GoalAllocation_workspaceId_goalId_fkey" FOREIGN KEY ("workspaceId","goalId") REFERENCES "SavingsGoal"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
