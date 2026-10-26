import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { proposeSubscriptionAction } from "@/modules/billing/manual-subscriptions";
import { HttpError } from "@/server/context";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { requireSystemRole, userManagementRoles } from "@/server/system-auth";

const schema = z.object({ reason: z.string().trim().min(12).max(500),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(userManagementRoles, request);
    const body = schema.parse(await readJsonBody(request, 2048));
    const { id } = await params;
    const grant = await prisma.subscriptionGrant.findUnique({ where: { id }, select: { userId: true } });
    if (!grant) throw new HttpError(404, "GRANT_NOT_FOUND", "Không tìm thấy lần cấp quyền.");
    return respond(await proposeSubscriptionAction(actor, { userId: grant.userId,
      kind: "REVOKE_MANUAL", grantId: id, ...body }), 202);
  } catch (error) { return failure(error); }
}
