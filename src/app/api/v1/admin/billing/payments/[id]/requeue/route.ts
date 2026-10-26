import type { NextRequest } from "next/server";
import { z } from "zod";
import { requeueDeadLetterBillingCredit } from "@/modules/billing/reconciliation";
import { requireSystemRole } from "@/server/system-auth";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";

const inputSchema = z.object({ reason: z.string().trim().min(12).max(500) }).strict();
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"], request);
    const { id } = await context.params;
    const input = inputSchema.parse(await readJsonBody(request, 2048));
    return respond(await requeueDeadLetterBillingCredit(actor, id, input.reason));
  } catch (error) { return failure(error); }
}
