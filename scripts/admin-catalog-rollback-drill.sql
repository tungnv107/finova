-- QA ONLY. Rehearse both new admin/catalog migration reversals in a transaction.
-- The entire exercise is rolled back; never execute against the finova database.
\set ON_ERROR_STOP on
BEGIN;
DROP TRIGGER finova_protect_published_price_trigger ON "PlanPrice";
DROP FUNCTION finova_protect_published_price();
ALTER TABLE "PlanPrice"
  DROP CONSTRAINT "PlanPrice_positive_price_check",
  DROP CONSTRAINT "PlanPrice_period_count_check",
  DROP CONSTRAINT "PlanPrice_currency_check",
  DROP CONSTRAINT "PlanPrice_version_check",
  DROP CONSTRAINT "PlanPrice_valid_window_check",
  DROP CONSTRAINT "PlanPrice_published_timestamp_check";
DROP INDEX "PlanPrice_single_published_product_key";
ALTER TABLE "PlanPrice" DROP COLUMN "publishedAt";
ALTER TABLE "PlanEntitlement"
  DROP CONSTRAINT "PlanEntitlement_planCode_fkey",
  DROP CONSTRAINT "PlanEntitlement_policy_version_check";
DROP INDEX "SystemRoleAssignment_active_user_role_key";
ALTER TABLE "AdminAuditLog" DROP CONSTRAINT "AdminAuditLog_required_fields_check";
-- Exercise rollback DDL, then restore the exact original QA schema atomically.
ROLLBACK;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'finova_protect_published_price_trigger')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'PlanPrice_single_published_product_key')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'SystemRoleAssignment_active_user_role_key')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_name = 'PlanPrice' AND column_name = 'publishedAt')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanEntitlement_planCode_fkey')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminAuditLog_required_fields_check') THEN
    RAISE EXCEPTION 'QA rollback drill left an altered schema';
  END IF;
END $$;
SELECT 'ADMIN_CATALOG_ROLLBACK_DRILL_PASS' AS result;
