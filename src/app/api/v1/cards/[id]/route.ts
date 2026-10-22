import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { updateCreditCard } from "@/server/credit-cards";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const { id } = await params; return respond(await updateCreditCard(await requireContext(request), id, await readJsonBody(request))); }
  catch (error) { return failure(error); }
}
