import { NextRequest } from "next/server";
import { z } from "zod";
import { requireBankSyncContext } from "@/server/premium";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { startSePayUnlink } from "@/modules/bank-sync/sepay/service";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireBankSyncContext(request);
    const input = z.object({ connectionId: z.string().min(1), accountId: z.string().min(1) })
      .strict().parse(await readJsonBody(request));
    return respond(await startSePayUnlink(context, input.connectionId, input.accountId), 201);
  } catch (error) { return failure(error); }
}
