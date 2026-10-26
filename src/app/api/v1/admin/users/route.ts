import type { NextRequest } from "next/server";
import { listAdminUsers } from "@/modules/admin/users";
import { failure, respond } from "@/server/http";
import { requireSystemRole, userManagementRoles } from "@/server/system-auth";
import type { UserAccessStatus } from "@finova/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireSystemRole(userManagementRoles, request);
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const rawStatus = request.nextUrl.searchParams.get("status");
    const status: UserAccessStatus | undefined = rawStatus === "ACTIVE" || rawStatus === "SUSPENDED" || rawStatus === "DEACTIVATED" ? rawStatus : undefined;
    return respond(await listAdminUsers({ q, cursor: request.nextUrl.searchParams.get("cursor") ?? undefined, status }));
  } catch (error) { return failure(error); }
}
