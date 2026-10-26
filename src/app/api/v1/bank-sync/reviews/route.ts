import { NextRequest } from "next/server";
import { requireBankSyncContext } from "@/server/premium";
import { failure, respond } from "@/server/http";
import { listBankReviews } from "@/modules/bank-sync/service";

export async function GET(request: NextRequest) {
  try { const context = await requireBankSyncContext(request); return respond(await listBankReviews(context.workspaceId)); }
  catch (error) { return failure(error); }
}
