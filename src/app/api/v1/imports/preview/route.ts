import { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { requireStatementImportContext } from "@/server/premium";
import { assertSameOrigin, failure, respond, limitedFormData } from "@/server/http";
import { previewImport } from "@/server/imports";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireStatementImportContext(request);
    const form = await limitedFormData(request, 6 * 1024 * 1024);
    const file = form.get("file");
    const options = form.get("options");
    if (!(file instanceof File) || typeof options !== "string") throw new HttpError(400, "INVALID_FILE", "Thiếu tệp hoặc ánh xạ CSV.");
    let config: unknown;
    try { config = JSON.parse(options); } catch { throw new HttpError(400, "INVALID_OPTIONS", "Ánh xạ CSV không hợp lệ."); }
    return respond(await previewImport(context, file, config), 201);
  } catch (error) { return failure(error); }
}
