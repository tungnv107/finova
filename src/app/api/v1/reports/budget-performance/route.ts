import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { failure, respond } from "@/server/http";
import { listBudgetPerformance } from "@/server/budgets";

export async function GET(request: NextRequest) {
  try { const { workspaceId } = await requireContext(request); return respond(await listBudgetPerformance(workspaceId)); }
  catch (error) { return failure(error); }
}
