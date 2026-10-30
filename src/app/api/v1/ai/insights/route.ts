import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond } from "@/server/http";
import { explainFinancialIntelligence, getFinancialIntelligence } from "@/server/ai/insights";
export async function GET(request: NextRequest) {
  try { return respond(await getFinancialIntelligence((await requireContext(request)).workspaceId)); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try { assertSameOrigin(request); return respond(await explainFinancialIntelligence((await requireContext(request)).workspaceId)); }
  catch (error) { return failure(error); }
}
