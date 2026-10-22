import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { refundTransaction } from "@/server/ledger";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const context = await requireContext(request); return respond(await refundTransaction(context, (await params).id, await readJsonBody(request), request.headers.get("Idempotency-Key")), 201); } catch (e) { return failure(e); }
}
