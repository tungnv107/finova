import { NextRequest } from "next/server";
import { requireContext, HttpError } from "@/server/context";
import { assertSameOrigin, failure, limitedFormData, respond } from "@/server/http";
import { statementMapping } from "@/modules/bank-sync/statement";
import { importBankStatement } from "@/modules/bank-sync/service";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireContext(request);
    const form = await limitedFormData(request, 6 * 1024 * 1024);
    const file = form.get("file"), mapping = form.get("mapping"), fileHash = form.get("fileHash"), previewToken = form.get("previewToken");
    if (!(file instanceof File) || typeof mapping !== "string") throw new HttpError(400, "INVALID_FILE", "Thiếu tệp/ánh xạ sao kê.");
    const hash = z.string().regex(/^[a-f0-9]{64}$/).parse(fileHash);
    const token = z.string().regex(/^[a-f0-9]{64}$/).parse(previewToken);
    let parsed: unknown;
    try { parsed = JSON.parse(mapping); } catch { throw new HttpError(400, "INVALID_MAPPING", "Ánh xạ không hợp lệ."); }
    return respond(await importBankStatement(context, file, statementMapping.parse(parsed), hash, token), 202);
  } catch (error) { return failure(error); }
}
