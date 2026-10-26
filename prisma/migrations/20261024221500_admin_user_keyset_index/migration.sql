-- Stable descending creation-time / ascending ID scan for system admin user pagination.
CREATE INDEX "User_createdAt_id_idx" ON "User"("createdAt" DESC, "id" ASC);
