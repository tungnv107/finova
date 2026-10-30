import { requirePageContext } from "@/server/page-context";
import { listBudgetPerformance } from "@/server/budgets";
import { listCategories } from "@/server/categories";
import { FinancialInsights } from "@/components/financial-insights";
import { getFinancialIntelligence } from "@/server/ai/insights";
import { BudgetManager } from "@/components/budget-manager";

export default async function BudgetsPage() {
  const context = await requirePageContext();
  const [budgets, categories, intelligence] = await Promise.all([
    listBudgetPerformance(context.workspaceId, true), listCategories(context.workspaceId), getFinancialIntelligence(context.workspaceId),
  ]);
  return <><BudgetManager initialBudgets={budgets} categories={categories.filter(c => c.kind === "EXPENSE").map(c => ({ id: c.id, name: c.name }))} /><FinancialInsights initial={intelligence} budgetsOnly /></>;
}
