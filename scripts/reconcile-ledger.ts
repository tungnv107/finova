/** Read-only financial integrity audit. Never mutates existing financial data. */
import { prisma } from "../src/lib/db";
import type { Prisma } from "@finova/prisma";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Finding = { id: string; workspaceId: string };
type AuditDb = Pick<Prisma.TransactionClient, "journal" | "$queryRaw">;

/** Can run inside a rolled-back integration transaction to probe corruption safely. */
export async function auditLedger(db: AuditDb, workspaceId: string | null = null) {
  const [journalCount, unbalanced, foreignPostings, brokenJournalLinks, transactionWithoutJournal,
    missingActiveJournal, liveVoidJournal, recurringLinks, importLinks, walletAccounts, categoryAccounts, badReversals] = await Promise.all([
    db.journal.count({ where: workspaceId ? { workspaceId } : undefined }),
    db.$queryRaw<Finding[]>`
      SELECT j.id, j."workspaceId" FROM "Journal" j
      LEFT JOIN "Posting" p ON p."journalId" = j.id
      WHERE (${workspaceId}::text IS NULL OR j."workspaceId" = ${workspaceId})
      GROUP BY j.id, j."workspaceId"
      HAVING COUNT(p.id) < 2
         OR COUNT(p.id) FILTER (WHERE p.side = 'DEBIT') = 0
         OR COUNT(p.id) FILTER (WHERE p.side = 'CREDIT') = 0
         OR COALESCE(SUM(p.amount) FILTER (WHERE p.side = 'DEBIT'), 0)
              <> COALESCE(SUM(p.amount) FILTER (WHERE p.side = 'CREDIT'), 0)
         OR COUNT(p.id) FILTER (WHERE p.amount <= 0 OR p.amount <> trunc(p.amount)) > 0`,
    db.$queryRaw<Finding[]>`
      SELECT p.id, j."workspaceId" FROM "Posting" p
      JOIN "Journal" j ON j.id = p."journalId"
      JOIN "LedgerAccount" a ON a.id = p."ledgerAccountId"
      WHERE (${workspaceId}::text IS NULL OR j."workspaceId" = ${workspaceId})
        AND (j."workspaceId" <> a."workspaceId" OR p.currency <> 'VND' OR a.currency <> p.currency)`,
    db.$queryRaw<Finding[]>`
      SELECT j.id, j."workspaceId" FROM "Journal" j
      LEFT JOIN "Transaction" t ON t.id = j."transactionId"
      LEFT JOIN "Journal" original ON original.id = j."reversedJournalId"
      WHERE (${workspaceId}::text IS NULL OR j."workspaceId" = ${workspaceId})
        AND ((j."transactionId" IS NOT NULL AND (t.id IS NULL OR t."workspaceId" <> j."workspaceId"))
          OR (j."reversedJournalId" IS NOT NULL AND (original.id IS NULL OR original."workspaceId" <> j."workspaceId"))
          OR (j.kind IN ('POSTED', 'REPLACEMENT', 'REVERSAL') AND j."transactionId" IS NULL)
          OR (j.kind = 'REVERSAL' AND (j."reversedJournalId" IS NULL
            OR original.kind = 'REVERSAL' OR original."transactionId" IS DISTINCT FROM j."transactionId"))
          OR (j.kind <> 'REVERSAL' AND j."reversedJournalId" IS NOT NULL))`,
    db.$queryRaw<Finding[]>`
      SELECT t.id, t."workspaceId" FROM "Transaction" t
      WHERE (${workspaceId}::text IS NULL OR t."workspaceId" = ${workspaceId})
        AND NOT EXISTS (SELECT 1 FROM "Journal" j WHERE j."workspaceId" = t."workspaceId"
          AND j."transactionId" = t.id AND j.kind IN ('POSTED', 'REPLACEMENT'))`,
    db.$queryRaw<Finding[]>`
      SELECT t.id, t."workspaceId" FROM "Transaction" t
      WHERE (${workspaceId}::text IS NULL OR t."workspaceId" = ${workspaceId})
        AND t.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM "Journal" j WHERE j."workspaceId" = t."workspaceId"
          AND j."transactionId" = t.id AND j.kind IN ('POSTED', 'REPLACEMENT')
          AND NOT EXISTS (SELECT 1 FROM "Journal" r WHERE r."reversedJournalId" = j.id))`,
    db.$queryRaw<Finding[]>`
      SELECT t.id, t."workspaceId" FROM "Transaction" t
      WHERE (${workspaceId}::text IS NULL OR t."workspaceId" = ${workspaceId})
        AND t.status = 'VOID'
        AND EXISTS (SELECT 1 FROM "Journal" j WHERE j."workspaceId" = t."workspaceId"
          AND j."transactionId" = t.id AND j.kind IN ('POSTED', 'REPLACEMENT')
          AND NOT EXISTS (SELECT 1 FROM "Journal" r WHERE r."reversedJournalId" = j.id))`,
    db.$queryRaw<Finding[]>`
      SELECT o.id, o."workspaceId" FROM "RecurringOccurrence" o
      LEFT JOIN "Transaction" t ON t.id = o."transactionId"
      WHERE (${workspaceId}::text IS NULL OR o."workspaceId" = ${workspaceId})
        AND ((o.status = 'POSTED' AND (t.id IS NULL OR t."workspaceId" <> o."workspaceId"
          OR t."idempotencyKey" IS DISTINCT FROM ('recurring:' || o."ruleId" || ':' || o."periodKey")))
          OR (o.status <> 'POSTED' AND o."transactionId" IS NOT NULL))`,
    db.$queryRaw<Finding[]>`
      SELECT r.id, r."workspaceId" FROM "ImportRow" r
      LEFT JOIN "Transaction" t ON t.id = r."transactionId"
      WHERE (${workspaceId}::text IS NULL OR r."workspaceId" = ${workspaceId})
        AND ((r.status = 'IMPORTED' AND (t.id IS NULL OR t."workspaceId" <> r."workspaceId"
          OR t."idempotencyKey" IS DISTINCT FROM ('import:' || r."sourceHash")
          OR EXISTS (SELECT 1 FROM "ImportRow" other WHERE other."transactionId" = r."transactionId"
            AND other.status = 'IMPORTED' AND other.id <> r.id)))
          OR (r.status <> 'IMPORTED' AND r."transactionId" IS NOT NULL))`,
    db.$queryRaw<Finding[]>`
      SELECT w.id, w."workspaceId" FROM "Wallet" w
      JOIN "LedgerAccount" a ON a.id = w."ledgerAccountId"
      WHERE (${workspaceId}::text IS NULL OR w."workspaceId" = ${workspaceId})
        AND (w."workspaceId" <> a."workspaceId" OR a.kind <> 'ASSET' OR a.currency <> w.currency)`,
    db.$queryRaw<Finding[]>`
      SELECT c.id, c."workspaceId" FROM "Category" c
      JOIN "LedgerAccount" a ON a.id = c."ledgerAccountId"
      WHERE (${workspaceId}::text IS NULL OR c."workspaceId" = ${workspaceId})
        AND (c."workspaceId" <> a."workspaceId" OR a.kind <> c.kind OR a.currency <> 'VND')`,
    // A reversal must invert each account/side total from its original journal.
    db.$queryRaw<Finding[]>`
      SELECT r.id, r."workspaceId" FROM "Journal" r
      WHERE (${workspaceId}::text IS NULL OR r."workspaceId" = ${workspaceId})
        AND r.kind = 'REVERSAL' AND r."reversedJournalId" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM LATERAL (
            SELECT "ledgerAccountId", side::text AS side, SUM(amount) AS amount FROM "Posting"
            WHERE "journalId" = r.id GROUP BY "ledgerAccountId", side
          ) rp FULL OUTER JOIN LATERAL (
            SELECT "ledgerAccountId", CASE WHEN side = 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END AS side,
              SUM(amount) AS amount FROM "Posting" WHERE "journalId" = r."reversedJournalId"
            GROUP BY "ledgerAccountId", side
          ) op USING ("ledgerAccountId", side)
          WHERE rp.amount IS DISTINCT FROM op.amount
        )`,
  ]);

  return { journalCount, findings: {
    UNBALANCED_JOURNAL: unbalanced,
    FOREIGN_POSTING: foreignPostings,
    JOURNAL_LINK: brokenJournalLinks,
    TRANSACTION_JOURNAL_MISSING: transactionWithoutJournal,
    ACTIVE_JOURNAL_MISSING: missingActiveJournal,
    VOID_JOURNAL_ACTIVE: liveVoidJournal,
    RECURRING_LINK: recurringLinks,
    IMPORT_LINK: importLinks,
    WALLET_ACCOUNT: walletAccounts,
    CATEGORY_ACCOUNT: categoryAccounts,
    REVERSAL_MISMATCH: badReversals,
  } };
}

async function main() {
  const { journalCount, findings } = await auditLedger(prisma, process.argv[2] ?? null);
  let failures = 0;
  for (const [name, rows] of Object.entries(findings)) {
    failures += rows.length;
    for (const item of rows.slice(0, 20)) console.error(`[${name}] workspace=${item.workspaceId} id=${item.id}`);
    if (rows.length > 20) console.error(`[${name}] còn ${rows.length - 20} lỗi không hiển thị`);
  }

  console.log(`Đã đối soát ${journalCount} journals (11 phép kiểm tra). Sai lệch: ${failures}.`);
  if (failures) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch(error => {
    console.error("Không hoàn thành đối soát:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }).finally(() => prisma.$disconnect());
}
