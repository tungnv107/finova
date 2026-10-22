import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { failure } from "@/server/http";
import { sendExport } from "@/server/export-http";

export async function GET(request: NextRequest) {
  try { const { workspaceId } = await requireContext(request); const q = request.nextUrl.searchParams;
    return await sendExport(workspaceId, "pdf", { start: q.get("start"), endExclusive: q.get("endExclusive"), walletId: q.get("walletId"), categoryId: q.get("categoryId") });
  } catch (error) { return failure(error); }
}
