import { NextRequest } from "next/server";
import { HttpError, requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { editTransaction, voidTransaction } from "@/server/ledger";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const context = await requireContext(request); return respond(await editTransaction(context, (await params).id, await readJsonBody(request))); } catch (e) { return failure(e); }
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const context = await requireContext(request); const version = Number(request.nextUrl.searchParams.get("version"));
    if (!Number.isSafeInteger(version) || version <= 0) throw new HttpError(400, "VALIDATION_ERROR", "Thiếu version hợp lệ.");
    return respond(await voidTransaction(context, (await params).id, version));
  } catch (e) { return failure(e); }
}
