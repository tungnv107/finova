import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { createDebt, listDebts } from "@/server/debts";

export async function GET() {
  try { const { workspaceId } = await requireContext(); return respond(await listDebts(workspaceId)); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try { assertSameOrigin(request); return respond(await createDebt(await requireContext(request), await readJsonBody(request)), 201); }
  catch (error) { return failure(error); }
}
