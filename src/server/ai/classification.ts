import { z } from "zod";
import { prisma } from "@/lib/db";
import { classifyFromHistory, redactDescription, type CategorySuggestion } from "@/lib/ai-classification";
import { aiConfigured, aiJson } from "./provider";
import { HttpError } from "@/server/context";

export async function classificationContext(workspaceId: string) {
  const [categories, history] = await Promise.all([
    prisma.category.findMany({ where: { workspaceId, archivedAt: null, kind: { in: ["INCOME", "EXPENSE"] } }, select: { id: true, name: true, kind: true } }),
    prisma.transaction.findMany({ where: { workspaceId, status: "ACTIVE", kind: { in: ["INCOME", "EXPENSE"] }, categoryId: { not: null }, note: { not: null } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 500, select: { note: true, categoryId: true, kind: true } }),
  ]);
  return { categories, history };
}
export async function suggestCategory(workspaceId: string, note: string, kind: "INCOME" | "EXPENSE", useAi = false): Promise<CategorySuggestion> {
  const context = await classificationContext(workspaceId);
  const local = classifyFromHistory(note, kind, context.categories, context.history);
  if (local.categoryId || !useAi) return local;
  if (!aiConfigured()) {
    // Explicit requests should report configuration failures instead of posing as an AI result.
    throw new HttpError(503, "AI_NOT_CONFIGURED", "Chưa cấu hình dịch vụ AI trên máy chủ.");
  }
  const result = await aiJson("category", "Suggest a category for this Vietnamese transaction. Select only an allowed category ID of the same kind, or null if uncertain. Explain briefly in Vietnamese.",
    [{ type: "input_text", text: JSON.stringify({ kind, note: redactDescription(note), categories: context.categories.filter(c => c.kind === kind),
      examples: context.history.slice(0, 60).map(h => ({ ...h, note: redactDescription(h.note ?? "") })) }) }],
    z.object({ categoryId: z.string().nullable(), confidence: z.number().min(0).max(1), reason: z.string().max(300) }));
  if (!context.categories.some(c => c.id === result.categoryId && c.kind === kind)) return local;
  return { ...result, source: "AI" };
}
