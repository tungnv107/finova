import { NextRequest } from "next/server";
import { requireStatementImportContext } from "@/server/premium";
import { assertSameOrigin, failure, limitedFormData, respond } from "@/server/http";
import { parseImportFile } from "@/lib/import-files";
import { HttpError } from "@/server/context";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await requireStatementImportContext(request);
    const form = await limitedFormData(request, 6 * 1024 * 1024);
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "INVALID_FILE", "Chưa chọn tệp.");
    let rows: string[][];
    try { ({ rows } = await parseImportFile(file)); }
    catch (error) { throw new HttpError(400, "IMPORT_INVALID", error instanceof Error ? error.message : "Tệp không hợp lệ."); }
    const columns = rows[0].map(v => v.trim());
    if (new Set(columns).size !== columns.length) throw new HttpError(400, "IMPORT_HEADERS", "Tiêu đề cột không được trùng.");
    return respond({ columns });
  } catch (error) { return failure(error); }
}
