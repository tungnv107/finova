import { NextResponse } from "next/server";
import { parseRange } from "@/lib/dates";
import { transactionsCsv } from "@/server/csv-export";
import { reportXlsx, reportPdf } from "@/server/file-exports";
import type { ReportFilter } from "@/server/reporting";

export async function sendExport(workspaceId: string, format: "csv" | "xlsx" | "pdf", filter: ReportFilter) {
  const period = parseRange(filter.start, filter.endExclusive);
  const body = format === "csv" ? Buffer.from((await transactionsCsv(workspaceId, filter)).content, "utf8")
    : format === "xlsx" ? await reportXlsx(workspaceId, filter) : await reportPdf(workspaceId, filter);
  const mime = format === "csv" ? "text/csv; charset=utf-8" : format === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf";
  return new NextResponse(new Uint8Array(body), { headers: {
    "Content-Type": mime, "Content-Disposition": `attachment; filename="finova-report-${period.start}-${period.endExclusive}.${format}"`,
    "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
  } });
}
