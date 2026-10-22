import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { failure, respond } from "@/server/http";
import { overview } from "@/server/reporting";

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireContext(request);
    const query = request.nextUrl.searchParams;
    return respond(await overview(workspaceId, {
      start: query.get("start"), endExclusive: query.get("endExclusive"), walletId: query.get("walletId"), categoryId: query.get("categoryId"),
    }));
  } catch (e) { return failure(e); }
}
