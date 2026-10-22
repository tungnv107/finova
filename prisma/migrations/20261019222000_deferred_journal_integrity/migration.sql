-- Defer financial checks to COMMIT so a journal and its postings can be inserted
-- together. Reject incomplete/unbalanced journals even from direct SQL writes.
-- No existing rows are deleted or modified.
CREATE FUNCTION finova_assert_journal_integrity(p_journal_id TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  journal_row RECORD;
  posting_count BIGINT;
  posting_delta NUMERIC;
BEGIN
  SELECT * INTO journal_row FROM "Journal" WHERE "id" = p_journal_id;
  IF NOT FOUND THEN RETURN; END IF; -- A journal deleted in this same transaction.

  SELECT COUNT(*),
         COALESCE(SUM(CASE WHEN "side" = 'DEBIT' THEN "amount" ELSE -"amount" END), 0)
    INTO posting_count, posting_delta
    FROM "Posting" WHERE "journalId" = p_journal_id;

  IF posting_count < 2 OR posting_delta <> 0 THEN
    RAISE EXCEPTION 'Journal % has % postings and debit-credit difference %', p_journal_id, posting_count, posting_delta
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Posting" p
    JOIN "LedgerAccount" account ON account."id" = p."ledgerAccountId"
    WHERE p."journalId" = p_journal_id
      AND (account."workspaceId" <> journal_row."workspaceId"
           OR p."amount" <= 0 OR p."amount" <> TRUNC(p."amount")
           OR p."currency" <> 'VND')
  ) THEN
    RAISE EXCEPTION 'Journal % contains invalid or foreign-workspace posting', p_journal_id
      USING ERRCODE = '23514';
  END IF;

  IF (journal_row."transactionId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "Transaction" t WHERE t."id" = journal_row."transactionId"
         AND t."workspaceId" = journal_row."workspaceId"
     ))
     OR (journal_row."walletId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "Wallet" w WHERE w."id" = journal_row."walletId"
         AND w."workspaceId" = journal_row."workspaceId"
     ))
     OR (journal_row."destinationWalletId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "Wallet" w WHERE w."id" = journal_row."destinationWalletId"
         AND w."workspaceId" = journal_row."workspaceId"
     ))
     OR (journal_row."reversedJournalId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "Journal" j WHERE j."id" = journal_row."reversedJournalId"
         AND j."workspaceId" = journal_row."workspaceId"
     ))
  THEN
    RAISE EXCEPTION 'Journal % references another workspace', p_journal_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION finova_validate_deferred_journal() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Journal' THEN
    PERFORM finova_assert_journal_integrity(NEW."id");
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM finova_assert_journal_integrity(OLD."journalId");
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM finova_assert_journal_integrity(NEW."journalId");
    IF NEW."journalId" <> OLD."journalId" THEN
      PERFORM finova_assert_journal_integrity(OLD."journalId");
    END IF;
  ELSE
    PERFORM finova_assert_journal_integrity(NEW."journalId");
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER finova_journal_integrity
AFTER INSERT OR UPDATE ON "Journal"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION finova_validate_deferred_journal();

CREATE CONSTRAINT TRIGGER finova_posting_integrity
AFTER INSERT OR UPDATE OR DELETE ON "Posting"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION finova_validate_deferred_journal();

-- Validate any existing financial records before completing the migration.
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT "id" FROM "Journal" LOOP
    PERFORM finova_assert_journal_integrity(rec."id");
  END LOOP;
END;
$$;
