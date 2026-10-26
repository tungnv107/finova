import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { requireStatementImportContext } from "@/server/premium";
import { failure } from "@/server/http";

const quote = (value: string) => {
  const literal = /^[\s]*[=+\-@]|^[\t\r]/u.test(value) ? `'${value}` : value;
  return `"${literal.replaceAll('"', '""')}"`;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await requireStatementImportContext(request);
    const id = (await params).id;
    if (!await prisma.importBatch.findFirst({ where: { id, workspaceId } })) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy đợt nhập.");
    const rows = await prisma.importRow.findMany({ where: { batchId: id, workspaceId, status: { in: ["INVALID", "FAILED", "DUPLICATE"] } }, orderBy: { rowNumber: "asc" } });
    const output = ["row,status,error,date,kind,amount,note", ...rows.map(r => [r.rowNumber, r.status, r.error || "", r.occurredAt?.toISOString().slice(0, 10) || "", r.kind || "", r.amount?.toFixed(0) || "", r.note || ""].map(v => quote(String(v))).join(","))].join("\r\n");
    return new Response(`\uFEFF${output}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="finova-import-errors.csv"', "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
