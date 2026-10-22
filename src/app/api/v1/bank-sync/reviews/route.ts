import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { failure, respond } from "@/server/http";
import { listBankReviews } from "@/modules/bank-sync/service";

export async function GET(request: NextRequest) {
  try { const context = await requireContext(request); return respond(await listBankReviews(context.workspaceId)); }
  catch (error) { return failure(error); }
}
