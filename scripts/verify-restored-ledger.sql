-- Used by restore-drill.ps1 via psql -f. Keeps quoted Prisma identifiers
-- intact on Windows PowerShell 5.1 (docker.exe -c can strip SQL quotes).
SELECT (
  SELECT COUNT(*) FROM "_prisma_migrations"
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
)::text || '|' || (
  SELECT COUNT(*) FROM (
    SELECT j."id"
    FROM "Journal" j
    LEFT JOIN "Posting" p ON p."journalId" = j."id"
    GROUP BY j."id"
    HAVING COALESCE(SUM(CASE WHEN p."side"::text = 'DEBIT'
      THEN p."amount" ELSE -p."amount" END), 0) <> 0
      OR COUNT(p."id") = 0
  ) broken
)::text AS restore_metrics;
