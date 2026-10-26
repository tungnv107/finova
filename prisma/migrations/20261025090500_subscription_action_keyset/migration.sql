-- Every pending request must remain reachable beyond the first 50 rows.
DROP INDEX IF EXISTS "SubscriptionActionRequest_status_createdAt_idx";
CREATE INDEX "SubscriptionActionRequest_status_createdAt_id_idx"
  ON "SubscriptionActionRequest"("status", "createdAt" DESC, "id" DESC);
