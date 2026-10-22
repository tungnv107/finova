import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { failure, respond } from "@/server/http";
import { expenseHeatmap } from "@/server/analytics";

export async function GET(request: NextRequest) {
  try { const { workspaceId } = await requireContext(request); const q = request.nextUrl.searchParams;
    return respond(await expenseHeatmap(workspaceId, { start: q.get("start"), endExclusive: q.get("endExclusive"), walletId: q.get("walletId"), categoryId: q.get("categoryId") }));
  } catch (error) { return failure(error); }
}
