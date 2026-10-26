import type { NextRequest } from "next/server";
import { getAdminUser } from "@/modules/admin/users";
import { failure, respond } from "@/server/http";
import { requireSystemRole, userManagementRoles } from "@/server/system-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSystemRole(userManagementRoles, request);
    return respond(await getAdminUser((await params).id));
  } catch (error) { return failure(error); }
}
