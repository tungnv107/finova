import { NextRequest } from "next/server";
import { requireBankSyncContext } from "@/server/premium";
import { assertSameOrigin, failure, respond } from "@/server/http";
import { startSePayLink } from "@/modules/bank-sync/sepay/service";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireBankSyncContext(request);
    return respond(await startSePayLink(context), 201);
  } catch (error) { return failure(error); }
}
