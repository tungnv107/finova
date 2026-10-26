import type { NextRequest } from "next/server";
import { getAdminOverview } from "@/modules/admin/overview";
import { allReportingRoles, requireSystemRole } from "@/server/system-auth";
import { failure, respond } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireSystemRole(allReportingRoles, request);
    return respond(await getAdminOverview(actor.role));
  } catch (error) { return failure(error); }
}
