import type { NextRequest } from "next/server";
import { acknowledgeBillingOperationalIncident } from "@/modules/admin/billing-operational-monitor";
import { requireSystemRole } from "@/server/system-auth";
import { assertSameOrigin, failure, respond } from "@/server/http";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireSystemRole(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"], request);
    const { id } = await context.params;
    return respond(await acknowledgeBillingOperationalIncident(actor, id));
  } catch (error) { return failure(error); }
}
