import { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { requireStatementImportContext } from "@/server/premium";
import { assertSameOrigin, failure, limitedFormData, respond } from "@/server/http";
import { previewAiStatement } from "@/server/ai/statements";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireStatementImportContext(request);
    const form = await limitedFormData(request, 6 * 1024 * 1024);
    const file = form.get("file"), text = form.get("text"), walletId = form.get("walletId");
    if (typeof walletId !== "string" || !walletId || form.get("consent") !== "true") throw new HttpError(400, "INVALID_FILE", "Chọn ví và đồng ý gửi dữ liệu cho AI.");
    const source = file instanceof File && text === null ? file : file === null && typeof text === "string" && text.trim() ? text : null;
    if (source === null) throw new HttpError(400, "INVALID_STATEMENT", "Chọn một tệp sao kê hoặc dán văn bản để phân tích.");
    return respond(await previewAiStatement(context, source, walletId), 201);
  } catch (error) { return failure(error); }
}
