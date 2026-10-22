import { NextRequest } from "next/server";
import { requireContext, HttpError } from "@/server/context";
import { failure, respond } from "@/server/http";
import { historicalTrends } from "@/server/analytics";

export async function GET(request: NextRequest) {
  try { const { workspaceId } = await requireContext(request); const q = request.nextUrl.searchParams;
    const months = Number(q.get("months") ?? 6);
    if (months !== 6 && months !== 12) throw new HttpError(400, "INVALID_MONTHS", "Chỉ hỗ trợ 6 hoặc 12 tháng.");
    return respond(await historicalTrends(workspaceId, { start: q.get("start"), endExclusive: q.get("endExclusive"), walletId: q.get("walletId"), categoryId: q.get("categoryId") }, months));
  } catch (error) { return failure(error); }
}
