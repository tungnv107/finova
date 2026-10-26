import type { NextRequest } from "next/server";
import { publishPriceDraft } from "@/modules/billing/catalog-admin";
import { assertSameOrigin, failure, respond } from "@/server/http";
import { requireSystemRole, userManagementRoles } from "@/server/system-auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(userManagementRoles, request);
    return respond(await publishPriceDraft(actor, (await params).id));
  } catch (error) { return failure(error); }
}
