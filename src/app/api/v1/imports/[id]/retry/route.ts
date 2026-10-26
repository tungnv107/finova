import { NextRequest } from "next/server";
import { requireStatementImportContext } from "@/server/premium";
import { assertSameOrigin, failure, respond } from "@/server/http";
import { retryFailedImport } from "@/server/imports";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    return respond(await retryFailedImport(await requireStatementImportContext(request), (await params).id));
  } catch (error) { return failure(error); }
}
