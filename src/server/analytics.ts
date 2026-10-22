import { prisma } from "@/lib/db";
import { localDay, parseRange, vndDayStart } from "@/lib/dates";
import { Decimal, money, normalAmount } from "@/lib/money";
import { HttpError } from "@/server/context";
import type { ReportFilter } from "@/server/reporting";

async function verifyFilter(workspaceId: string, filter: ReportFilter) {
  if (filter.walletId && !(await prisma.wallet.count({ where: { workspaceId, id: filter.walletId } })))
    throw new HttpError(404, "NOT_FOUND", "Ví không thuộc tài khoản của bạn.");
  if (filter.categoryId && !(await prisma.category.count({ where: { workspaceId, id: filter.categoryId } })))
    throw new HttpError(404, "NOT_FOUND", "Danh mục không thuộc tài khoản của bạn.");
}

async function financialLines(workspaceId: string, from: Date, to: Date, filter: ReportFilter) {
  await verifyFilter(workspaceId, filter);
  // PostgreSQL stores Prisma DateTime as UTC TIMESTAMP(3) without timezone.
  // Interpret as UTC before assigning the Vietnamese calendar day.
  const walletId = filter.walletId ?? null;
  const categoryId = filter.categoryId ?? null;
  return prisma.$queryRaw<Array<{ day: string; kind: "INCOME" | "EXPENSE"; side: "DEBIT" | "CREDIT"; amount: Decimal }>>`
    SELECT ((j."effectiveAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS day,
      a."kind" AS kind, p."side" AS side, SUM(p."amount") AS amount
    FROM "Posting" p
    JOIN "LedgerAccount" a ON a."id" = p."ledgerAccountId"
    JOIN "Journal" j ON j."id" = p."journalId"
    LEFT JOIN "Category" c ON c."ledgerAccountId" = a."id"
    WHERE a."workspaceId" = ${workspaceId}
      AND j."workspaceId" = ${workspaceId}
      AND a."kind" IN ('INCOME', 'EXPENSE')
      AND j."effectiveAt" >= ${from} AND j."effectiveAt" < ${to}
      AND (${walletId}::text IS NULL OR j."walletId" = ${walletId}::text)
      AND (${categoryId}::text IS NULL OR c."id" = ${categoryId}::text)
    GROUP BY day, a."kind", p."side"
  `;
}

function nextDate(day: string) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function expenseHeatmap(workspaceId: string, filter: ReportFilter = {}) {
  const range = parseRange(filter.start, filter.endExclusive);
  const lines = await financialLines(workspaceId, range.from, range.to, filter);
  const sums = new Map<string, Decimal>();
  for (const row of lines) {
    if (row.kind !== "EXPENSE") continue;
    sums.set(row.day, (sums.get(row.day) ?? new Decimal(0)).plus(normalAmount("EXPENSE", row.side, row.amount.toString())));
  }
  const days: { date: string; expense: string }[] = [];
  for (let day = range.start; day < range.endExclusive; day = nextDate(day)) {
    days.push({ date: day, expense: money(sums.get(day) ?? 0) });
  }
  return { period: { start: range.start, endExclusive: range.endExclusive }, days };
}

function monthStart(year: number, zeroMonth: number) {
  const date = new Date(Date.UTC(year, zeroMonth, 1));
  return date.toISOString().slice(0, 7) + "-01";
}

export async function historicalTrends(workspaceId: string, filter: ReportFilter = {}, months: 6 | 12 = 6) {
  const range = parseRange(filter.start, filter.endExclusive);
  const last = localDay(new Date(range.to.getTime() - 1));
  const year = Number(last.slice(0, 4));
  const month = Number(last.slice(5, 7)) - 1;
  const start = monthStart(year, month - months + 1);
  const end = monthStart(year, month + 1);
  const lines = await financialLines(workspaceId, vndDayStart(start), vndDayStart(end), filter);
  const data = new Map<string, { income: Decimal; expense: Decimal }>();
  for (let i = 0; i < months; i++) data.set(monthStart(year, month - months + 1 + i).slice(0, 7), { income: new Decimal(0), expense: new Decimal(0) });
  for (const row of lines) {
    const key = row.day.slice(0, 7);
    const bucket = data.get(key);
    if (!bucket) continue;
    if (row.kind === "INCOME") bucket.income = bucket.income.plus(normalAmount("INCOME", row.side, row.amount.toString()));
    if (row.kind === "EXPENSE") bucket.expense = bucket.expense.plus(normalAmount("EXPENSE", row.side, row.amount.toString()));
  }
  return { period: { start, endExclusive: end }, months: [...data].map(([month, b]) => ({
    month, income: money(b.income), expense: money(b.expense), surplus: money(b.income.minus(b.expense)),
  })) };
}
