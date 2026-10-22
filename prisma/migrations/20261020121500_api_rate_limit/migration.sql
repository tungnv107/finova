CREATE TABLE "ApiRateLimit" (
  "key" VARCHAR(64) NOT NULL,
  "windowStart" TIMESTAMPTZ(0) NOT NULL,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMPTZ(0) NOT NULL,
  CONSTRAINT "ApiRateLimit_pkey" PRIMARY KEY ("key", "windowStart"),
  CONSTRAINT "ApiRateLimit_count_check" CHECK ("count" >= 1)
);

CREATE INDEX "ApiRateLimit_expiresAt_idx" ON "ApiRateLimit"("expiresAt");
