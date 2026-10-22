-- Additive P4 budget schema. Existing financial journals and user data are untouched.
CREATE TYPE "BudgetPeriod" AS ENUM ('WEEKLY', 'MONTHLY', 'CUSTOM');
CREATE TYPE "BudgetScope" AS ENUM ('TOTAL', 'CATEGORY', 'GROUP');
CREATE TYPE "BudgetThreshold" AS ENUM ('P50', 'P80', 'P100', 'OVER100');

CREATE TABLE "Budget" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope" "BudgetScope" NOT NULL,
  "period" "BudgetPeriod" NOT NULL,
  "limitAmount" DECIMAL(20,4) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Budget_positive_limit" CHECK ("limitAmount" > 0),
  CONSTRAINT "Budget_valid_period" CHECK ("endAt" > "startAt"),
  CONSTRAINT "Budget_vnd_only" CHECK ("currency" = 'VND')
);

CREATE TABLE "BudgetCategory" (
  "workspaceId" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("budgetId","categoryId")
);

CREATE TABLE "BudgetAlert" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "threshold" "BudgetThreshold" NOT NULL,
  "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Budget_workspaceId_id_key" ON "Budget"("workspaceId","id");
CREATE INDEX "Budget_workspaceId_archivedAt_startAt_endAt_idx" ON "Budget"("workspaceId","archivedAt","startAt","endAt");
CREATE INDEX "BudgetCategory_workspaceId_categoryId_idx" ON "BudgetCategory"("workspaceId","categoryId");
CREATE UNIQUE INDEX "BudgetAlert_budgetId_periodKey_threshold_key" ON "BudgetAlert"("budgetId","periodKey","threshold");

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_workspaceId_budgetId_fkey" FOREIGN KEY ("workspaceId","budgetId") REFERENCES "Budget"("workspaceId","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_workspaceId_categoryId_fkey" FOREIGN KEY ("workspaceId","categoryId") REFERENCES "Category"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
