-- Stable descending keyset for subscription lifecycle even when multiple
-- events have the same timestamp or new rows arrive between page requests.
CREATE INDEX "SubscriptionEvent_createdAt_id_idx"
  ON "SubscriptionEvent"("createdAt" DESC, "id" DESC);
