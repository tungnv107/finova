CREATE TABLE "ProductUsageDaily" (
    "userId" TEXT NOT NULL,
    "dayVn" DATE NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductUsageDaily_pkey" PRIMARY KEY ("userId", "dayVn")
);

CREATE TABLE "ProductPageviewReceipt" (
    "userId" TEXT NOT NULL,
    "navigationId" TEXT NOT NULL,
    "routeGroup" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPageviewReceipt_pkey" PRIMARY KEY ("userId", "navigationId")
);

CREATE INDEX "ProductUsageDaily_dayVn_idx" ON "ProductUsageDaily"("dayVn");
CREATE INDEX "ProductPageviewReceipt_createdAt_idx" ON "ProductPageviewReceipt"("createdAt");

ALTER TABLE "ProductUsageDaily" ADD CONSTRAINT "ProductUsageDaily_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPageviewReceipt" ADD CONSTRAINT "ProductPageviewReceipt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
