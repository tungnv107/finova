import { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { requireBankSyncContext } from "@/server/premium";
import { assertSameOrigin, failure, limitedFormData, respond } from "@/server/http";
import { readBankStatement } from "@/modules/bank-sync/statement";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await requireBankSyncContext(request);
    const form = await limitedFormData(request, 6 * 1024 * 1024);
    const file = form.get("file"), mapping = form.get("mapping");
    if (!(file instanceof File) || typeof mapping !== "string") throw new HttpError(400, "INVALID_FILE", "Thiếu tệp/ánh xạ sao kê.");
    let options: unknown;
    try { options = JSON.parse(mapping); } catch { throw new HttpError(400, "INVALID_MAPPING", "Ánh xạ không hợp lệ."); }
    const preview = await readBankStatement(file, options);
    return respond({ fileHash: preview.fileHash, previewToken: preview.previewToken, fileName: preview.fileName, walletId: preview.walletId,
      cutoverAt: preview.cutoverAt, validCount: preview.validCount, invalidCount: preview.invalidCount, total: preview.total,
      rows: preview.rows.slice(0, 100).map(row => ({ rowNumber: row.rowNumber, status: row.status, date: row.date,
        direction: row.transaction?.direction ?? null, amount: row.transaction?.amount ?? null, error: row.error })) });
  } catch (error) { return failure(error); }
}
