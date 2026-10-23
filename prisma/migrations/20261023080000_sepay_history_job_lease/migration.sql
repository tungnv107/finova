-- A running history job leases the right to advance the connection watermark.
-- Expired jobs may be reclaimed after a crash without deleting their audit trail.
ALTER TABLE "bank_sync_jobs" ADD COLUMN "leaseUntil" TIMESTAMP(3);
