import type { NextRequest } from "next/server";
import { listAdminPayments } from "@/modules/admin/payments";
import { requireSystemRole } from "@/server/system-auth";
import { failure, respond } from "@/server/http";

const financeRoles = ["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"] as const;
export async function GET(request: NextRequest) {
  try {
    await requireSystemRole(financeRoles, request);
    const { searchParams } = request.nextUrl;
    const page = Number(searchParams.get("page") ?? "0");
    const reviewOnly = searchParams.get("review") === "1";
    return respond(await listAdminPayments({ page: Number.isSafeInteger(page) ? page : 0, reviewOnly }));
  } catch (error) { return failure(error); }
}
