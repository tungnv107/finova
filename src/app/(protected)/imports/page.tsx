import { requirePageContext, requirePremiumPage } from "@/server/page-context";
import { prisma } from "@/lib/db";
import { walletBalances } from "@/server/ledger";
import { AiStatementImporter } from "@/components/ai-statement-importer";
import { aiConfigured, aiUsesChatCompletions } from "@/server/ai/provider";
import { ImportManager } from "@/components/import-manager";

export default async function ImportsPage() {
  const { workspaceId, userId } = await requirePageContext();
  await requirePremiumPage(userId, "STATEMENT_IMPORT");
  const [wallets, categories, batches] = await Promise.all([
    walletBalances(workspaceId),
    prisma.category.findMany({ where: { workspaceId, archivedAt: null }, select: { id: true, name: true, kind: true } }),
    prisma.importBatch.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, fileName: true, status: true, createdAt: true } }),
  ]);
  return <><div className="page-head"><div><h1 className="page-title">Nhập sao kê thông minh</h1><p className="subtitle">AI đọc, phân loại và chuẩn bị giao dịch để nhập vào ví.</p></div></div><AiStatementImporter available={aiConfigured()} pdfOnlyDocuments={aiUsesChatCompletions()} wallets={wallets.filter(w => !w.archived).map(w => ({ id: w.id, name: w.name }))} categories={categories} /><ImportManager wallets={wallets.filter(w => !w.archived).map(w => ({ id: w.id, name: w.name }))} categories={categories} batches={batches} /></>;
}
