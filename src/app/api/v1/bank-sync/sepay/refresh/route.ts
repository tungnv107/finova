import { NextRequest } from "next/server";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { refreshSePayAccountStatuses } from "@/modules/bank-sync/sepay/service";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireContext(request);
    const { connectionId } = z.object({ connectionId: z.string().min(1) }).strict().parse(await readJsonBody(request));
    return respond(await refreshSePayAccountStatuses(context, connectionId));
  } catch (error) { return failure(error); }
}
