import { NextRequest } from "next/server";
import { z } from "zod";
import { requireBankSyncContext } from "@/server/premium";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { syncSePayHistory } from "@/modules/bank-sync/sepay/service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requireBankSyncContext(request);
    const { id } = await params;
    const { from, to } = z.object({ from: z.iso.date(), to: z.iso.date() }).strict().parse(await readJsonBody(request));
    return respond(await syncSePayHistory(context, id, from, to));
  } catch (error) { return failure(error); }
}
