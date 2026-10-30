import { requirePageContext, requirePremiumPage } from "@/server/page-context";
import { prisma } from "@/lib/db";
import { walletBalances } from "@/server/ledger";
import { aiConfigured, aiUsesChatCompletions } from "@/server/ai/provider";
import { ImportManager } from "@/components/import-manager";
import { getImport } from "@/server/imports";
import { HttpError } from "@/server/context";

export default async function ImportsPage({ searchParams }: { searchParams: Promise<{ batch?: string | string[] }> }) {
  const { workspaceId, userId } = await requirePageContext();
  await requirePremiumPage(userId, "STATEMENT_IMPORT");
  const { batch: batchId } = await searchParams;
  let initialPreview: Awaited<ReturnType<typeof getImport>> | null = null;
  let initialError = "";
  if (typeof batchId === "string" && batchId) {
    try { initialPreview = await getImport(workspaceId, batchId); }
    catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      initialError = "Không tìm thấy đợt nhập. Hãy chọn lại trong lịch sử bên dưới.";
    }
  }
  const [wallets, categories, batches] = await Promise.all([
    walletBalances(workspaceId),
    prisma.category.findMany({ where: { workspaceId, archivedAt: null }, select: { id: true, name: true, kind: true } }),
    prisma.importBatch.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, fileName: true, status: true, createdAt: true } }),
  ]);
  return <><div className="page-head"><div><h1 className="page-title">Nhập sao kê thông minh</h1><p className="subtitle">AI đọc, phân loại và chuẩn bị giao dịch để nhập vào ví.</p></div></div><ImportManager aiAvailable={aiConfigured()} pdfOnlyDocuments={aiUsesChatCompletions()} wallets={wallets.filter(w => !w.archived).map(w => ({ id: w.id, name: w.name }))} categories={categories} batches={batches} initialPreview={initialPreview} initialError={initialError} /></>;
}
