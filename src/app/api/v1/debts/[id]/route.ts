import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { updateDebt } from "@/server/debts";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const { id } = await params; return respond(await updateDebt(await requireContext(request), id, await readJsonBody(request))); }
  catch (error) { return failure(error); }
}
