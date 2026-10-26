import { NextRequest } from "next/server";
import { z } from "zod";
import { requireBankSyncContext } from "@/server/premium";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { attachSePayAccount, availableSePayAccounts } from "@/modules/bank-sync/sepay/service";

export async function GET(request: NextRequest) {
  try {
    const context = await requireBankSyncContext(request);
    const id = z.string().min(1).max(200).parse(request.nextUrl.searchParams.get("connectionId"));
    return respond(await availableSePayAccounts(context, id));
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireBankSyncContext(request);
    const input = z.object({ connectionId: z.string().min(1), accountXid: z.string().min(1),
      walletId: z.string().min(1), acceptedConsent: z.literal(true) }).strict().parse(await readJsonBody(request));
    return respond(await attachSePayAccount(context, input.connectionId, input.accountXid, input.walletId, input.acceptedConsent), 201);
  } catch (error) { return failure(error); }
}
