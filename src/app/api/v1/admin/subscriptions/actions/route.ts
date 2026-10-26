import type { NextRequest } from "next/server";
import { listSubscriptionActions } from "@/modules/billing/manual-subscriptions";
import { failure, respond } from "@/server/http";
import { requireSystemRole } from "@/server/system-auth";

export async function GET(request: NextRequest) {
  try {
    await requireSystemRole(["SUPER_ADMIN", "ADMIN"], request);
    const value = request.nextUrl.searchParams.get("status");
    const status = value === "APPROVED" || value === "REJECTED" ? value : "PENDING";
    return respond(await listSubscriptionActions(status));
  } catch (error) { return failure(error); }
}
