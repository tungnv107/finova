import { NextRequest } from "next/server";
import { createTransaction, listTransactionsPage } from "@/server/ledger";
import { HttpError, requireContext } from "@/server/context";
import { parseRange } from "@/lib/dates";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireContext(request);
    const query = request.nextUrl.searchParams;
    const range = parseRange(query.get("start"), query.get("endExclusive"));
    const kind = query.get("kind");
    if (kind && !["INCOME", "EXPENSE", "TRANSFER", "REFUND"].includes(kind)) throw new HttpError(400, "INVALID_KIND", "Loại giao dịch không hợp lệ.");
    const typedKind = kind === "INCOME" || kind === "EXPENSE" || kind === "TRANSFER" || kind === "REFUND" ? kind : undefined;
    const sort = query.get("sort") ?? "desc";
    if (sort !== "asc" && sort !== "desc") throw new HttpError(400, "INVALID_SORT", "Thứ tự sắp xếp không hợp lệ.");
    const search = query.get("search")?.trim();
    if (search && search.length > 200) throw new HttpError(400, "INVALID_SEARCH", "Từ khóa tối đa 200 ký tự.");
    const categoryScope = query.get("categoryScope") ?? "direct";
    if (categoryScope !== "direct" && categoryScope !== "subtree") throw new HttpError(400, "INVALID_CATEGORY_SCOPE", "Phạm vi danh mục không hợp lệ.");
    const includeRefunds = query.get("includeRefunds") ?? "false";
    if (includeRefunds !== "true" && includeRefunds !== "false") throw new HttpError(400, "INVALID_REFUND_FILTER", "Bộ lọc hoàn tiền không hợp lệ.");
    const feeOnly = query.get("feeOnly") ?? "false";
    if (feeOnly !== "true" && feeOnly !== "false") throw new HttpError(400, "INVALID_FEE_FILTER", "Bộ lọc phí không hợp lệ.");
    if ((categoryScope === "subtree" && !query.get("categoryId")) || (includeRefunds === "true" && kind !== "EXPENSE")) throw new HttpError(400, "INVALID_FILTER", "Bộ lọc danh mục/hoàn tiền không hợp lệ.");
    if (feeOnly === "true" && (kind !== "TRANSFER" || query.has("categoryId"))) throw new HttpError(400, "INVALID_FEE_FILTER", "Bộ lọc phí chỉ áp dụng cho giao dịch chuyển ví.");
    const size = Number(query.get("limit") ?? "50");
    return respond(await listTransactionsPage(workspaceId, { from: range.from, to: range.to, kind: typedKind, walletId: query.get("walletId") ?? undefined, categoryId: query.get("categoryId") ?? undefined, categoryScope, includeRefunds: includeRefunds === "true", feeOnly: feeOnly === "true", search: search || undefined, sort, cursor: query.get("cursor") ?? undefined, limit: size }));
  } catch (e) { return failure(e); }
}
export async function POST(request: NextRequest) {
  try { assertSameOrigin(request); const context = await requireContext(request); return respond(await createTransaction(context, await readJsonBody(request), request.headers.get("Idempotency-Key")), 201); } catch (e) { return failure(e); }
}
