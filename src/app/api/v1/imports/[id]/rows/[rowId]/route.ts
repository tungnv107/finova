import { NextRequest } from "next/server";
import { requireStatementImportContext } from "@/server/premium";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { reviewStatementRow } from "@/server/ai/statements";
export async function PATCH(request: NextRequest, route: { params: Promise<{ id: string; rowId: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requireStatementImportContext(request), { id, rowId } = await route.params;
    return respond(await reviewStatementRow(context, id, rowId, await readJsonBody(request)));
  } catch (error) { return failure(error); }
}
