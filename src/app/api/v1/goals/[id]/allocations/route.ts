import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { allocateGoal } from "@/server/goals";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return respond(await allocateGoal(await requireContext(request), id, await readJsonBody(request), request.headers.get("Idempotency-Key")), 201);
  } catch (error) { return failure(error); }
}
