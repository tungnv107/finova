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
    const file = form.get("file"), walletId = form.get("walletId");
    if (!(file instanceof File) || typeof walletId !== "string" || !walletId || form.get("consent") !== "true") throw new HttpError(400, "INVALID_FILE", "Chọn sao kê, ví và đồng ý gửi dữ liệu cho AI.");
    return respond(await previewAiStatement(context, file, walletId), 201);
  } catch (error) { return failure(error); }
}
