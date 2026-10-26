import type { NextRequest } from "next/server";
import { z } from "zod";
import { createPriceDraft, listAdminPriceVersions } from "@/modules/billing/catalog-admin";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { requireSystemRole, userManagementRoles } from "@/server/system-auth";

const draft = z.object({ productCode: z.enum(["PREMIUM_MONTHLY", "PREMIUM_YEARLY"]),
  priceVnd: z.number().int().positive().safe() }).strict();

export async function GET(request: NextRequest) {
  try {
    const actor = await requireSystemRole(userManagementRoles, request);
    return respond(await listAdminPriceVersions(actor));
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(userManagementRoles, request);
    const input = draft.parse(await readJsonBody(request, 2048));
    return respond(await createPriceDraft(actor, input.productCode, input.priceVnd), 201);
  } catch (error) { return failure(error); }
}
