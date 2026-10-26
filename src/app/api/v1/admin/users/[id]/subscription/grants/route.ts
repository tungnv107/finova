import type { NextRequest } from "next/server";
import { z } from "zod";
import { proposeSubscriptionAction } from "@/modules/billing/manual-subscriptions";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { requireSystemRole, userManagementRoles } from "@/server/system-auth";

const schema = z.object({ period: z.enum(["MONTH", "YEAR"]), reason: z.string().trim().min(12).max(500),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(userManagementRoles, request);
    const body = schema.parse(await readJsonBody(request, 2048));
    return respond(await proposeSubscriptionAction(actor, { userId: (await params).id,
      kind: "MANUAL_GRANT", ...body }), 202);
  } catch (error) { return failure(error); }
}
