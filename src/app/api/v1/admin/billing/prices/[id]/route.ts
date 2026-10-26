import type { NextRequest } from "next/server";
import { z } from "zod";
import { deletePriceDraft, updatePriceDraft } from "@/modules/billing/catalog-admin";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { requireSystemRole, userManagementRoles } from "@/server/system-auth";

const update = z.object({ priceVnd: z.number().int().positive().safe() }).strict();
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(userManagementRoles, request);
    const input = update.parse(await readJsonBody(request, 2048));
    return respond(await updatePriceDraft(actor, (await params).id, input.priceVnd));
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(userManagementRoles, request);
    return respond(await deletePriceDraft(actor, (await params).id));
  } catch (error) { return failure(error); }
}
