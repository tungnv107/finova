-- Additive: existing transfers have no fee. Reversals remain immutable.
ALTER TABLE "Transaction" ADD COLUMN "feeAmount" DECIMAL(20,4) NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_feeAmount_nonnegative" CHECK ("feeAmount" >= 0 AND "feeAmount" = TRUNC("feeAmount"));
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_feeAmount_transfer_only" CHECK ("kind" = 'TRANSFER' OR "feeAmount" = 0);
