import { NextRequest, NextResponse } from "next/server";
import { requireSystemRole, allReportingRoles } from "@/server/system-auth";
import { HttpError } from "@/server/context";
import { failure } from "@/server/http";
import { encodeAdminAggregateReport, prepareAdminAggregateReport,
  type AdminExportDays, type AdminExportFormat, type AdminExportKind } from "@/modules/admin/analytics-export";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireSystemRole(allReportingRoles, request);
    const q = request.nextUrl.searchParams;
    const kind = q.get("kind");
    const format = q.get("format");
    const days = Number(q.get("days"));
    if ((kind !== "billing" && kind !== "traffic") || (format !== "csv" && format !== "xlsx") ||
      ![7, 30, 90].includes(days)) {
      throw new HttpError(400, "INVALID_EXPORT", "Loại báo cáo, định dạng hoặc kỳ báo cáo không hợp lệ.");
    }
    if (kind === "traffic" && actor.role === "FINANCE_OPERATOR") {
      throw new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Không có quyền xem thống kê truy cập.");
    }
    const report = await prepareAdminAggregateReport(kind as AdminExportKind, days as AdminExportDays);
    const bytes = await encodeAdminAggregateReport(report, format as AdminExportFormat);
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new NextResponse(body, { headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" :
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="finova-admin-${kind}-${report.fromVn}-${report.untilVn}.${format}"`,
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return failure(error); }
}
