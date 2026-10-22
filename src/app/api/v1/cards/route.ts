import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { createCreditCard, listCreditCards } from "@/server/credit-cards";

export async function GET() {
  try { const { workspaceId } = await requireContext(); return respond(await listCreditCards(workspaceId)); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try { assertSameOrigin(request); return respond(await createCreditCard(await requireContext(request), await readJsonBody(request)), 201); }
  catch (error) { return failure(error); }
}
