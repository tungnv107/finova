-- One active assignment of each system role per user; historic revoked rows are retained.
CREATE UNIQUE INDEX "SystemRoleAssignment_active_user_role_key"
  ON "SystemRoleAssignment" ("userId", "role") WHERE "revokedAt" IS NULL;

ALTER TABLE "AdminAuditLog"
  ADD CONSTRAINT "AdminAuditLog_required_fields_check" CHECK (
    length(btrim("actorId")) > 0 AND length(btrim("action")) > 0 AND
    length(btrim("resourceType")) > 0 AND length(btrim("resourceId")) > 0
  );
