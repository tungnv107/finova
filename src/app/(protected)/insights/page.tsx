import { requirePageContext } from "@/server/page-context";
import { getFinancialIntelligence } from "@/server/ai/insights";
import { FinancialInsights } from "@/components/financial-insights";
export default async function InsightsPage() {
  const context = await requirePageContext();
  return <FinancialInsights initial={await getFinancialIntelligence(context.workspaceId)} />;
}
