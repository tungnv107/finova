import type { NextRequest } from "next/server";
import { z } from "zod";
import { decideSubscriptionAction } from "@/modules/billing/manual-subscriptions";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { requireSystemRole } from "@/server/system-auth";

const schema = z.object({ decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(12).max(500) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(["SUPER_ADMIN"], request);
    const body = schema.parse(await readJsonBody(request, 2048));
    return respond(await decideSubscriptionAction(actor, (await params).id, body.decision, body.reason));
  } catch (error) { return failure(error); }
}
