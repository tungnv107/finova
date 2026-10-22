import { prisma } from "@/lib/db";
import { Decimal, money, normalAmount } from "@/lib/money";
import { localDay, vndDayStart } from "@/lib/dates";
import { HttpError } from "@/server/context";

async function snapshot(workspaceId: string, day: string) {
  const end = new Date(vndDayStart(day).getTime() + 86400_000);
  // Aggregate in PostgreSQL: a long-lived account must not load its entire posting history.
  // Both the account and its journal are scoped, including for legacy/inconsistent links.
  const rows = await prisma.$queryRaw<Array<{ kind: "ASSET" | "RECEIVABLE" | "LIABILITY"; side: "DEBIT" | "CREDIT"; amount: Decimal }>>`
    SELECT a."kind" AS kind, p."side" AS side, SUM(p."amount") AS amount
    FROM "Posting" p
    JOIN "LedgerAccount" a ON a."id" = p."ledgerAccountId"
    JOIN "Journal" j ON j."id" = p."journalId"
    WHERE a."workspaceId" = ${workspaceId}
      AND j."workspaceId" = ${workspaceId}
      AND a."kind" IN ('ASSET', 'RECEIVABLE', 'LIABILITY')
      AND j."effectiveAt" < ${end}
    GROUP BY a."kind", p."side"
  `;
  const sums = { assets: new Decimal(0), receivables: new Decimal(0), liabilities: new Decimal(0) };
  for (const p of rows) {
    const kind = p.kind;
    if (kind === "ASSET") sums.assets = sums.assets.plus(normalAmount(kind, p.side, p.amount.toString()));
    if (kind === "RECEIVABLE") sums.receivables = sums.receivables.plus(normalAmount(kind, p.side, p.amount.toString()));
    if (kind === "LIABILITY") sums.liabilities = sums.liabilities.plus(normalAmount(kind, p.side, p.amount.toString()));
  }
  return { date: day, assets: money(sums.assets), receivables: money(sums.receivables),
    liabilities: money(sums.liabilities), netWorth: money(sums.assets.plus(sums.receivables).minus(sums.liabilities)) };
}

export async function netWorth(workspaceId: string, date = localDay(new Date()), compareDate?: string | null) {
  const day = vndDayStart(date);
  const maxDay = vndDayStart(localDay(new Date()));
  if (day > maxDay) throw new HttpError(400, "INVALID_DATE", "Không thể báo cáo giá trị tài sản tương lai như số thực tế.");
  const previous = compareDate ?? localDay(new Date(day.getTime() - 30 * 86400_000));
  if (vndDayStart(previous) > maxDay) throw new HttpError(400, "INVALID_DATE", "Ngày so sánh không hợp lệ.");
  const [current, comparison] = await Promise.all([snapshot(workspaceId, date), snapshot(workspaceId, previous)]);
  return { current, comparison, change: money(new Decimal(current.netWorth).minus(comparison.netWorth)),
    equation: "Tài sản + Phải thu − Nợ phải trả", includesArchivedWallets: true };
}
