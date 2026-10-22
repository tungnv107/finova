import { prisma } from "@/lib/db";
import { Decimal, money } from "@/lib/money";
import { localDay, parseRange } from "@/lib/dates";
import { listTransactionsPage, walletBalances } from "@/server/ledger";
import { HttpError } from "@/server/context";
import { netWorth } from "@/server/net-worth";
import { budgetKpiChoice, compareKpi, overviewCalendar } from "@/lib/overview-kpis";

export type ReportFilter = { start?: string | null; endExclusive?: string | null; walletId?: string | null; categoryId?: string | null };

export async function overview(
  workspaceId: string, filter: ReportFilter = {},
  onQueryTiming?: (name: string, elapsedMs: number) => void,
) {
  const period = parseRange(filter.start, filter.endExclusive);
  if (filter.walletId && !(await prisma.wallet.count({ where: { workspaceId, id: filter.walletId } }))) {
    throw new HttpError(404, "NOT_FOUND", "Ví không thuộc tài khoản của bạn.");
  }
  if (filter.categoryId && !(await prisma.category.count({ where: { workspaceId, id: filter.categoryId } }))) {
    throw new HttpError(404, "NOT_FOUND", "Danh mục không thuộc tài khoản của bạn.");
  }

  // Keep the optional predicates in the prepared statement. This avoids
  // injecting variable SQL fragments into a $queryRaw template.
  const walletId = filter.walletId ?? null;
  const categoryId = filter.categoryId ?? null;
  const { previousFrom, previousTo, currentAsOf, previousAsOf, actualTo, hasStarted, elapsedDays, periodDays } =
    overviewCalendar(period.from, period.to);
  if (!hasStarted || !currentAsOf || !previousAsOf) {
    throw new HttpError(400, "FUTURE_REPORT", "Kỳ báo cáo chưa bắt đầu; chưa có dữ liệu thực tế để phân tích.");
  }
  const timed = async <T>(name: string, read: () => PromiseLike<T>): Promise<T> => {
    if (!onQueryTiming) return read();
    const started = performance.now();
    try {
      return await read();
    } finally {
      onQueryTiming(name, performance.now() - started);
    }
  };
  const [lines, wallets, recent, topExpenses, previousLines, previousWallets, worth, matchingBudgets] = await Promise.all([
    // Aggregate in PostgreSQL: a month with 10k postings should return only
    // day/account buckets, preserving debit/credit reversal signs exactly.
    timed("aggregate", () => prisma.$queryRaw<Array<{
      day: string; kind: "INCOME" | "EXPENSE"; accountId: string; accountName: string; accountCode: string;
      categoryId: string | null; categoryName: string | null; categoryColor: string | null; amount: Decimal;
    }>>`
      SELECT ((j."effectiveAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS day,
        a."kind" AS kind, a."id" AS "accountId", a."name" AS "accountName", a."code" AS "accountCode",
        c."id" AS "categoryId", c."name" AS "categoryName", c."color" AS "categoryColor",
        SUM(CASE WHEN (a."kind" = 'EXPENSE'::"AccountKind" AND p."side" = 'DEBIT'::"EntrySide")
                    OR (a."kind" = 'INCOME'::"AccountKind" AND p."side" = 'CREDIT'::"EntrySide")
          THEN p."amount" ELSE -p."amount" END) AS amount
      FROM "Journal" j
      JOIN "Posting" p ON p."journalId" = j."id"
      JOIN "LedgerAccount" a ON a."id" = p."ledgerAccountId"
      LEFT JOIN "Category" c ON c."ledgerAccountId" = a."id" AND c."workspaceId" = ${workspaceId}
      WHERE j."workspaceId" = ${workspaceId} AND a."workspaceId" = ${workspaceId}
        AND a."kind" IN ('INCOME', 'EXPENSE')
        AND j."effectiveAt" >= ${period.from} AND j."effectiveAt" < ${actualTo}
        AND (${walletId}::text IS NULL OR j."walletId" = ${walletId}::text)
        AND (${categoryId}::text IS NULL OR c."id" = ${categoryId}::text)
      GROUP BY day, a."kind", a."id", a."name", a."code", c."id", c."name", c."color"
    `),
    timed("walletBalances", () => walletBalances(workspaceId, actualTo)),
    timed("transactionPage", () => listTransactionsPage(workspaceId, { from: period.from, to: actualTo, walletId: filter.walletId || undefined, categoryId: filter.categoryId || undefined, limit: 8 })),
    timed("topExpenses", () => prisma.transaction.findMany({
      where: { workspaceId, status: "ACTIVE", kind: "EXPENSE", occurredAt: { gte: period.from, lt: actualTo },
        walletId: filter.walletId || undefined, categoryId: filter.categoryId || undefined },
      orderBy: [{ amount: "desc" }, { occurredAt: "desc" }], take: 5,
    })),
    timed("previousAggregate", () => prisma.$queryRaw<Array<{ kind: "INCOME" | "EXPENSE"; amount: Decimal }>>`
      SELECT a."kind" AS kind,
        SUM(CASE WHEN (a."kind" = 'EXPENSE'::"AccountKind" AND p."side" = 'DEBIT'::"EntrySide")
                   OR (a."kind" = 'INCOME'::"AccountKind" AND p."side" = 'CREDIT'::"EntrySide")
          THEN p."amount" ELSE -p."amount" END) AS amount
      FROM "Journal" j
      JOIN "Posting" p ON p."journalId" = j."id"
      JOIN "LedgerAccount" a ON a."id" = p."ledgerAccountId"
      LEFT JOIN "Category" c ON c."ledgerAccountId" = a."id" AND c."workspaceId" = ${workspaceId}
      WHERE j."workspaceId" = ${workspaceId} AND a."workspaceId" = ${workspaceId}
        AND a."kind" IN ('INCOME', 'EXPENSE')
        AND j."effectiveAt" >= ${previousFrom} AND j."effectiveAt" < ${previousTo}
        AND (${walletId}::text IS NULL OR j."walletId" = ${walletId}::text)
        AND (${categoryId}::text IS NULL OR c."id" = ${categoryId}::text)
      GROUP BY a."kind"
    `),
    timed("previousWalletBalances", () => walletBalances(workspaceId, previousTo)),
    timed("netWorth", () => netWorth(workspaceId, currentAsOf, previousAsOf)),
    // Only an exact-period budget can be compared with this overview period.
    // Filtered reports do not silently present workspace-wide budget usage.
    filter.walletId || filter.categoryId ? Promise.resolve([]) : timed("matchingBudgets", () => prisma.budget.findMany({
      where: { workspaceId, archivedAt: null, startAt: period.from, endAt: period.to },
      select: { id: true, name: true, scope: true, limitAmount: true },
    })),
  ]);

  let income = new Decimal(0);
  let expense = new Decimal(0);
  const days = new Map<string, { income: Decimal; expense: Decimal }>();
  const categories = new Map<string, { id: string; name: string; color: string; amount: Decimal }>();
  for (const line of lines) {
    const kind = line.kind;
    if (kind !== "INCOME" && kind !== "EXPENSE") continue;
    const amount = new Decimal(line.amount.toString());
    const day = line.day;
    const bucket = days.get(day) ?? { income: new Decimal(0), expense: new Decimal(0) };
    if (kind === "INCOME") { income = income.add(amount); bucket.income = bucket.income.add(amount); }
    if (kind === "EXPENSE") {
      expense = expense.add(amount); bucket.expense = bucket.expense.add(amount);
      // Interest and other ledger-only expenses have no user Category.
      // Include them in the breakdown so its sum always equals the expense KPI.
      const cat = line.categoryId
        ? { id: line.categoryId, name: line.categoryName!, color: line.categoryColor! }
        : { id: line.accountCode === "EXPENSE_TRANSFER_FEE" ? "ledger:transfer-fee" : `ledger:${line.accountId}`, name: line.accountName, color: "#94A3B8" };
      const entry = categories.get(cat.id) ?? { ...cat, amount: new Decimal(0) };
      entry.amount = entry.amount.add(amount);
      categories.set(cat.id, entry);
    }
    days.set(day, bucket);
  }
  const surplus = income.minus(expense);
  const eligibleWallets = wallets.filter((w) => w.includeInAvailable && (!filter.walletId || w.id === filter.walletId));
  const available = eligibleWallets.reduce((s, w) => s.plus(w.balance), new Decimal(0));
  const savingsRate = income.gt(0) ? surplus.div(income).mul(100).toDecimalPlaces(2).toString() : null;
  const previous = { income: new Decimal(0), expense: new Decimal(0) };
  for (const line of previousLines) {
    if (line.kind === "INCOME") previous.income = previous.income.plus(line.amount.toString());
    if (line.kind === "EXPENSE") previous.expense = previous.expense.plus(line.amount.toString());
  }
  const previousSurplus = previous.income.minus(previous.expense);
  const previousAvailable = previousWallets
    .filter(w => w.includeInAvailable && (!filter.walletId || w.id === filter.walletId))
    .reduce((s, w) => s.plus(w.balance), new Decimal(0));
  const previousSavingsRate = previous.income.gt(0)
    ? previousSurplus.div(previous.income).mul(100).toDecimalPlaces(2).toString() : null;
  const previousAverage = money(previous.expense.div(periodDays).toDecimalPlaces(0));
  const currentKpis = {
    income: money(income), expense: money(expense), surplus: money(surplus), available: money(available),
    savingsRate, averageDailyExpense: money(expense.div(elapsedDays).toDecimalPlaces(0)),
    netWorth: worth.current.netWorth,
  };
  const previousKpis = {
    income: money(previous.income), expense: money(previous.expense), surplus: money(previousSurplus),
    available: money(previousAvailable), savingsRate: previousSavingsRate,
    averageDailyExpense: previousAverage, netWorth: worth.comparison.netWorth,
  };
  const selectedBudget = budgetKpiChoice(matchingBudgets);
  const budgetUsage = selectedBudget ? await timed("budgetUsage", async () => {
    const rows = await prisma.$queryRaw<Array<{ used: Decimal | null }>>`
      SELECT SUM(CASE WHEN p."side" = 'DEBIT'::"EntrySide" THEN p."amount" ELSE -p."amount" END) AS used
      FROM "Journal" j
      JOIN "Posting" p ON p."journalId" = j."id"
      JOIN "LedgerAccount" a ON a."id" = p."ledgerAccountId"
      WHERE j."workspaceId" = ${workspaceId} AND a."workspaceId" = ${workspaceId}
        AND a."kind" = 'EXPENSE'::"AccountKind"
        AND j."effectiveAt" >= ${period.from} AND j."effectiveAt" < ${actualTo}
        AND (${selectedBudget.scope} = 'TOTAL' OR EXISTS (
          SELECT 1 FROM "BudgetCategory" bc
          JOIN "Category" c ON c."id" = bc."categoryId" AND c."workspaceId" = bc."workspaceId"
          WHERE bc."budgetId" = ${selectedBudget.id} AND bc."workspaceId" = ${workspaceId}
            AND c."ledgerAccountId" = a."id"
        ))
    `;
    const used = new Decimal(rows[0]?.used?.toString() ?? 0);
    const limit = new Decimal(selectedBudget.limitAmount.toString());
    return { budgetId: selectedBudget.id, name: selectedBudget.name, scope: selectedBudget.scope,
      used: money(used), limit: money(limit), percent: used.div(limit).mul(100).toDecimalPlaces(2).toString() };
  }) : null;
  return {
    period: { start: period.start, endExclusive: period.endExclusive, actualEndExclusive: localDay(actualTo), timezone: "Asia/Ho_Chi_Minh" },
    filters: { walletId: filter.walletId || null, categoryId: filter.categoryId || null },
    kpis: { ...currentKpis, budgetUsage },
    comparison: {
      mode: "equal_calendar_days" as const,
      // For an ongoing period, the current daily average is to-date; the
      // comparison daily average is over the complete previous window.
      averageDayBasis: { current: elapsedDays, previous: periodDays },
      start: localDay(previousFrom), endExclusive: localDay(previousTo),
      previous: previousKpis,
      changes: {
        income: compareKpi(currentKpis.income, previousKpis.income),
        expense: compareKpi(currentKpis.expense, previousKpis.expense),
        surplus: compareKpi(currentKpis.surplus, previousKpis.surplus),
        available: compareKpi(currentKpis.available, previousKpis.available),
        savingsRate: compareKpi(currentKpis.savingsRate, previousKpis.savingsRate),
        averageDailyExpense: compareKpi(currentKpis.averageDailyExpense, previousKpis.averageDailyExpense),
        netWorth: compareKpi(currentKpis.netWorth, previousKpis.netWorth),
        budgetUsage: null,
      },
    },
    worth,
    wallets: wallets.filter((w) => !filter.walletId || w.id === filter.walletId),
    series: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amounts]) => ({ date, income: money(amounts.income), expense: money(amounts.expense), surplus: money(amounts.income.minus(amounts.expense)) })),
    categories: [...categories.values()].sort((a, b) => b.amount.comparedTo(a.amount)).map((c) => ({ id: c.id, name: c.name, color: c.color, amount: money(c.amount) })),
    topExpenses: topExpenses.map(t => ({ id: t.id, amount: money(t.amount.toString()), occurredAt: t.occurredAt.toISOString(), categoryId: t.categoryId, note: t.note })),
    recentTransactions: recent.items,
  };
}
