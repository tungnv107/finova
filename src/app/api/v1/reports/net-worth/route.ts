import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { failure, respond } from "@/server/http";
import { netWorth } from "@/server/net-worth";

export async function GET(request: NextRequest) {
  try { const { workspaceId } = await requireContext(request); const params = request.nextUrl.searchParams;
    return respond(await netWorth(workspaceId, params.get("date") ?? undefined, params.get("compareDate"))); }
  catch (error) { return failure(error); }
}
