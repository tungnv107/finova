import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { updateRule } from "@/server/recurring";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); return respond(await updateRule(await requireContext(request), (await params).id, await readJsonBody(request))); }
  catch (error) { return failure(error); }
}
