import { NextRequest } from "next/server";
import { z } from "zod";
import { requireBankSyncContext } from "@/server/premium";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { createSandboxConnection, listBankConnections } from "@/modules/bank-sync/service";

export async function GET(request: NextRequest) {
  try { const context = await requireBankSyncContext(request); return respond(await listBankConnections(context.workspaceId)); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireBankSyncContext(request);
    const input = z.object({ mode: z.literal("SANDBOX"), walletId: z.string().min(1) }).strict().parse(await readJsonBody(request));
    return respond(await createSandboxConnection(context, input.walletId), 201);
  } catch (error) { return failure(error); }
}
