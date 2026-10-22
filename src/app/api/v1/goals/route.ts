import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { createGoal, listGoals } from "@/server/goals";

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireContext();
    return respond(await listGoals(workspaceId, request.nextUrl.searchParams.get("includeArchived") === "true"));
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    return respond(await createGoal(await requireContext(request), await readJsonBody(request)), 201);
  } catch (error) { return failure(error); }
}
