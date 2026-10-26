import { NextRequest, NextResponse } from "next/server";
import type { UserAccessStatus } from "@finova/prisma";
import { exportAdminUsers } from "@/modules/admin/users";
import { failure } from "@/server/http";
import { requireSystemRole } from "@/server/system-auth";
import { HttpError } from "@/server/context";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireSystemRole(["SUPER_ADMIN"], request);
    const query = request.nextUrl.searchParams;
    const raw = query.get("status");
    if (raw && raw !== "ACTIVE" && raw !== "SUSPENDED" && raw !== "DEACTIVATED") {
      throw new HttpError(400, "INVALID_FILTER", "Bộ lọc trạng thái không hợp lệ.");
    }
    const status = (raw || undefined) as UserAccessStatus | undefined;
    const bytes = await exportAdminUsers(actor, { q: query.get("q") ?? undefined, status });
    return new NextResponse(bytes, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=finova-admin-users.csv",
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return failure(error); }
}
