import { z } from "zod";
import { prisma } from "@/lib/db";
import { Decimal, money } from "@/lib/money";
import { localDay, vndDayStart } from "@/lib/dates";
import { financialIntelligence, monthOffset, type FinancialDay } from "@/lib/financial-intelligence";
import { aiConfigured, aiJson } from "./provider";

export async function getFinancialIntelligence(workspaceId: string, now = new Date()) {
  const today = localDay(now);
  const from = vndDayStart(monthOffset(today, -3));
  const to = new Date(vndDayStart(today).getTime() + 86400000);
  const [raw, categories, budgets] = await Promise.all([
    prisma.$queryRaw<Array<Omit<FinancialDay, "amount"> & { amount: Decimal }>>`
      SELECT ((j."effectiveAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS day,
        a."kind" AS kind, c."id" AS "categoryId", COALESCE(c."name", a."name") AS name,
        SUM(CASE WHEN (a."kind" = 'EXPENSE' AND p."side" = 'DEBIT') OR (a."kind" = 'INCOME' AND p."side" = 'CREDIT') THEN p."amount" ELSE -p."amount" END) AS amount
      FROM "Posting" p JOIN "LedgerAccount" a ON a."id" = p."ledgerAccountId"
      JOIN "Journal" j ON j."id" = p."journalId"
      LEFT JOIN "Category" c ON c."ledgerAccountId" = a."id" AND c."workspaceId" = a."workspaceId"
      WHERE a."workspaceId" = ${workspaceId} AND j."workspaceId" = ${workspaceId}
        AND a."kind" IN ('INCOME', 'EXPENSE') AND j."effectiveAt" >= ${from} AND j."effectiveAt" < ${to}
      GROUP BY day, a."kind", c."id", c."name", a."name"`,
    prisma.category.findMany({ where: { workspaceId, kind: "EXPENSE", archivedAt: null }, select: { id: true, name: true } }),
    prisma.budget.findMany({ where: { workspaceId, archivedAt: null, startAt: { lt: vndDayStart(monthOffset(today, 1)) }, endAt: { gt: vndDayStart(monthOffset(today, 0)) } }, include: { categories: { select: { categoryId: true } } } }),
  ]);
  const rows = raw.map(r => ({ ...r, amount: money(r.amount) }));
  const result = financialIntelligence(rows, categories, now);
  const forecasts = budgets.filter(b => b.startAt <= now && b.endAt > now).map(b => {
    const start = localDay(b.startAt), end = localDay(b.endAt), ids = b.categories.map(c => c.categoryId);
    if (b.startAt < from) return { id: b.id, name: b.name, limitAmount: money(b.limitAmount.toString()), used: null, projected: null, risk: "INSUFFICIENT" as const, endExclusive: end };
    const used = rows.filter(r => r.kind === "EXPENSE" && r.day >= start && r.day < end && (b.scope === "TOTAL" || ids.includes(r.categoryId ?? ""))).reduce((s, r) => s.plus(r.amount), new Decimal(0));
    const elapsed = Math.max(1, Math.round((vndDayStart(today).getTime() - b.startAt.getTime()) / 86400000) + 1);
    const duration = Math.round((b.endAt.getTime() - b.startAt.getTime()) / 86400000);
    const projected = Decimal.max(0, used).div(elapsed).mul(duration), limit = new Decimal(b.limitAmount.toString());
    return { id: b.id, name: b.name, limitAmount: money(limit), used: money(used), projected: money(projected),
      risk: used.gt(limit) ? "OVER" as const : elapsed < 7 ? "INSUFFICIENT" as const : projected.gt(limit) ? "AT_RISK" as const : "ON_TRACK" as const, endExclusive: end };
  });
  return { ...result, forecasts, coveredCategoryIds: [...new Set(budgets.flatMap(b => b.categories.map(c => c.categoryId)))], aiAvailable: aiConfigured() };
}

export async function explainFinancialIntelligence(workspaceId: string) {
  const data = await getFinancialIntelligence(workspaceId);
  const narrative = await aiJson("financial_insights", "Explain the supplied personal finance aggregates in Vietnamese. Base every number and statement on these aggregates. Explain expense changes through category deltas, not invented life events. Distinguish observations from hypotheses. Suggest concrete spending/budget actions, no investment advice. Mention low data and projection uncertainty. Do not claim all historical months are complete.",
    [{ type: "input_text", text: JSON.stringify({ period: data.period, totals: data.totals, comparison: data.comparison, drivers: data.drivers, months: data.months, forecasts: data.forecasts, suggestedBudgets: data.suggestions, historyMonths: data.historyMonths }) }],
    z.object({ summary: z.string().max(1200), observations: z.array(z.string().max(500)).max(5), recommendations: z.array(z.string().max(500)).max(5) }));
  return { ...data, narrative };
}
