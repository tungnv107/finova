import { prisma } from "@/lib/db";
import { requirePageContext } from "@/server/page-context";
import { overview } from "@/server/reporting";
import { FinanceDashboard } from "@/components/finance-dashboard";
import { ReportTabs } from "@/components/report-tabs";
import { expenseHeatmap, historicalTrends } from "@/server/analytics";
import { listBudgetPerformance } from "@/server/budgets";

export async function DashboardPage({ searchParams, detailed = false }: { searchParams: Promise<Record<string, string | string[] | undefined>>; detailed?: boolean }) {
  const ctx = await requirePageContext();
  const q = await searchParams;
  const get = (key: string) => typeof q[key] === "string" ? q[key] as string : undefined;
  const [report, wallets, categories] = await Promise.all([
    overview(ctx.workspaceId, { start: get("start"), endExclusive: get("endExclusive"), walletId: get("walletId"), categoryId: get("categoryId") }),
    prisma.wallet.findMany({ where: { workspaceId: ctx.workspaceId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ where: { workspaceId: ctx.workspaceId }, select: { id: true, name: true, parentId: true, kind: true, color: true, archivedAt: true }, orderBy: { name: "asc" } }),
  ]);
  const dashboard = <FinanceDashboard report={report} allWallets={wallets} allCategories={categories.map(c => ({ ...c, archived: c.archivedAt !== null }))} worth={report.worth} detailed={detailed} />;
  if (!detailed) return dashboard;
  const filter = { start: get("start"), endExclusive: get("endExclusive"), walletId: get("walletId"), categoryId: get("categoryId") };
  const [heatmap, trends, budgets] = await Promise.all([
    expenseHeatmap(ctx.workspaceId, filter), historicalTrends(ctx.workspaceId, filter, 12), listBudgetPerformance(ctx.workspaceId),
  ]);
  return <ReportTabs report={report} heatmap={heatmap} trends={trends} budgets={budgets}>{dashboard}</ReportTabs>;
}
