import type { NextRequest } from "next/server";
import { z } from "zod";
import { changeUserAccess } from "@/modules/admin/users";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { requireSystemRole, userManagementRoles } from "@/server/system-auth";

const input = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]),
  reason: z.string().trim().min(10).max(500) }).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(userManagementRoles, request, { recentSignIn: true });
    const body = input.parse(await readJsonBody(request, 2048));
    return respond(await changeUserAccess(actor, (await params).id, body.status, body.reason));
  } catch (error) { return failure(error); }
}
