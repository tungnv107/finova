-- Migration of existing published catalog entries without repricing any order.
ALTER TABLE "PlanPrice" ADD COLUMN "publishedAt" TIMESTAMP(3);
UPDATE "PlanPrice" SET "publishedAt" = "effectiveFrom" WHERE "isPublished" = true;

ALTER TABLE "PlanPrice"
  ADD CONSTRAINT "PlanPrice_positive_price_check" CHECK ("priceVnd" BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT "PlanPrice_period_count_check" CHECK ("periodCount" = 1),
  ADD CONSTRAINT "PlanPrice_currency_check" CHECK ("currency" = 'VND'),
  ADD CONSTRAINT "PlanPrice_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "PlanPrice_valid_window_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  ADD CONSTRAINT "PlanPrice_published_timestamp_check" CHECK (NOT "isPublished" OR "publishedAt" IS NOT NULL);

CREATE UNIQUE INDEX "PlanPrice_single_published_product_key"
  ON "PlanPrice" ("productCode") WHERE "isPublished" = true;

ALTER TABLE "PlanEntitlement"
  ADD CONSTRAINT "PlanEntitlement_planCode_fkey" FOREIGN KEY ("planCode")
  REFERENCES "SubscriptionPlan" ("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlanEntitlement"
  ADD CONSTRAINT "PlanEntitlement_policy_version_check" CHECK ("policyVersion" >= 1);

-- PostgreSQL protects historical commercial terms even from accidental direct Prisma/SQL updates.
-- Only publication status/effectiveTo may change for an already-published version.
CREATE FUNCTION finova_protect_published_price() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."publishedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'published price history is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."publishedAt" IS NOT NULL THEN
    IF ROW(NEW."planCode", NEW."productCode", NEW."billingPeriod", NEW."periodCount",
           NEW."priceVnd", NEW."currency", NEW."version", NEW."effectiveFrom", NEW."publishedAt")
       IS DISTINCT FROM
       ROW(OLD."planCode", OLD."productCode", OLD."billingPeriod", OLD."periodCount",
           OLD."priceVnd", OLD."currency", OLD."version", OLD."effectiveFrom", OLD."publishedAt")
       OR (NOT OLD."isPublished" AND NEW."isPublished") THEN
      RAISE EXCEPTION 'published price history is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finova_protect_published_price_trigger
  BEFORE UPDATE OR DELETE ON "PlanPrice"
  FOR EACH ROW EXECUTE FUNCTION finova_protect_published_price();
