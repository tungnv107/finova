ALTER TABLE "ImportRow"
  ADD COLUMN "sourceReference" VARCHAR(200),
  ADD COLUMN "confidence" DOUBLE PRECISION,
  ADD COLUMN "categoryReason" VARCHAR(500),
  ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;
