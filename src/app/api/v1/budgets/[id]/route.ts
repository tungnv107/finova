import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { updateBudget } from "@/server/budgets";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return respond(await updateBudget(await requireContext(request), id, await readJsonBody(request)));
  } catch (error) { return failure(error); }
}
