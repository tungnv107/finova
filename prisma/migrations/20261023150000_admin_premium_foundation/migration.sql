-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'FINANCE_OPERATOR', 'ANALYST');

-- CreateEnum
CREATE TYPE "UserAccessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "BillingOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'EXPIRED', 'REVIEW', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BillingReceivingStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "SystemRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SystemRole" NOT NULL,
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SystemRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccessState" (
    "userId" TEXT NOT NULL,
    "status" "UserAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "changedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccessState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "reason" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "billingPeriod" "BillingPeriod" NOT NULL,
    "periodCount" INTEGER NOT NULL DEFAULT 1,
    "priceVnd" DECIMAL(20,0) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEntitlement" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PlanEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingReceivingAccount" (
    "id" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumberEncrypted" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "status" "BillingReceivingStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "BillingReceivingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "receiverAccountId" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "billingPeriodSnapshot" "BillingPeriod" NOT NULL,
    "periodCountSnapshot" INTEGER NOT NULL,
    "amountDueVnd" DECIMAL(20,0) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" "BillingOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "BillingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountRef" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountVnd" DECIMAL(20,0) NOT NULL,
    "reference" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL,

    CONSTRAINT "BillingPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentEventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountVnd" DECIMAL(20,0) NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "userId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL DEFAULT 'LITE',
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "billingAnniversaryDay" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SubscriptionGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "grantType" TEXT NOT NULL,
    "billingPeriod" "BillingPeriod",
    "periodCount" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "reason" TEXT,

    CONSTRAINT "SubscriptionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemRoleAssignment_userId_revokedAt_idx" ON "SystemRoleAssignment"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorId_createdAt_idx" ON "AdminAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_resourceType_resourceId_createdAt_idx" ON "AdminAuditLog"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanPrice_planCode_isPublished_idx" ON "PlanPrice"("planCode", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrice_productCode_version_key" ON "PlanPrice"("productCode", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntitlement_planCode_featureKey_policyVersion_key" ON "PlanEntitlement"("planCode", "featureKey", "policyVersion");

-- CreateIndex
CREATE INDEX "BillingReceivingAccount_status_createdAt_idx" ON "BillingReceivingAccount"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingOrder_orderCode_key" ON "BillingOrder"("orderCode");

-- CreateIndex
CREATE INDEX "BillingOrder_userId_createdAt_idx" ON "BillingOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingOrder_status_expiresAt_idx" ON "BillingOrder"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingOrder_userId_idempotencyKey_key" ON "BillingOrder"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPaymentEvent_provider_providerAccountRef_providerTra_key" ON "BillingPaymentEvent"("provider", "providerAccountRef", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentEventId_key" ON "PaymentAllocation"("paymentEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_orderId_key" ON "PaymentAllocation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionGrant_orderId_key" ON "SubscriptionGrant"("orderId");

-- CreateIndex
CREATE INDEX "SubscriptionGrant_userId_startsAt_expiresAt_idx" ON "SubscriptionGrant"("userId", "startsAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "SystemRoleAssignment" ADD CONSTRAINT "SystemRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessState" ADD CONSTRAINT "UserAccessState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "SubscriptionPlan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "PlanPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_receiverAccountId_fkey" FOREIGN KEY ("receiverAccountId") REFERENCES "BillingReceivingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentEventId_fkey" FOREIGN KEY ("paymentEventId") REFERENCES "BillingPaymentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BillingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionGrant" ADD CONSTRAINT "SubscriptionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionGrant" ADD CONSTRAINT "SubscriptionGrant_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BillingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
