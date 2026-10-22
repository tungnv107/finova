import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/context";
import { failure } from "@/server/http";
import { transactionsCsv } from "@/server/csv-export";

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireContext(request);
    const q = request.nextUrl.searchParams;
    const result = await transactionsCsv(workspaceId, {
      start: q.get("start"), endExclusive: q.get("endExclusive"), walletId: q.get("walletId"), categoryId: q.get("categoryId"),
    });
    return new NextResponse(result.content, { status: 200, headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="finova-transactions-${result.period.start}-${result.period.endExclusive}.csv"`,
      "Cache-Control": "private, no-store, max-age=0", "X-Finova-Row-Count": String(result.count),
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return failure(error); }
}
