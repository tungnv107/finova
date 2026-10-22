import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { createRule, listRecurring, syncRecurring } from "@/server/recurring";

export async function GET() {
  try { const ctx = await requireContext(); return respond(await listRecurring(ctx.workspaceId)); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try { assertSameOrigin(request); return respond(await createRule(await requireContext(request), await readJsonBody(request)), 201); }
  catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest) {
  try { assertSameOrigin(request); return respond(await syncRecurring(await requireContext(request))); }
  catch (error) { return failure(error); }
}
